import Foundation

/// What a pan on the Siri Remote's clickpad means to the Apple TV player
/// while no focusable layer is up (NativePlayerViewController's recognizer
/// mode). Pure so tests/native/TVRemotePanGateTests.swift can drive it
/// (scripts/ios/test-tv-remote-pan.sh); the controller feeds it the pan's
/// movement and every remote press, and carries out what it answers.
///
/// A thumb on the clickpad is not a swipe. It rests there between presses,
/// trembles, and rolls as it clicks the centre or slides to the ring. Taken
/// as a swipe, that movement armed a scrub, which pauses and moves the
/// target, and the press the thumb was making (Play/Pause, Select) then
/// committed it: pausing jumped elsewhere and played on. So a pan has to
/// travel a dead zone before it arms a scrub or summons the chrome, and a
/// pan that overlaps a press is the press: it stops, and a scrub it armed
/// just before is taken back so the press acts on the player as it was.
struct TVRemotePanGate {
	enum Action: Equatable {
		case none
		case showControls
		/// Arm a scrub, then move it by the travel that crossed the dead zone.
		case beginScrub(points: Double)
		/// Horizontal movement, in points, for an armed scrub.
		case moveScrub(points: Double)
	}

	enum PressAction: Equatable {
		case none
		/// The pan in progress was the thumb making the press: it does
		/// nothing more.
		case stopPan
		/// That pan also armed the scrub just now: cancel it without seeking.
		case cancelScrub
	}

	/// How far, in points along one axis, a pan travels before it arms a
	/// scrub or summons the chrome (the travel then moves the scrub). The touch surface spans roughly the
	/// 1920pt screen, so this is about a twentieth of a swipe across it: past
	/// a resting thumb's tremble and settle, well short of any deliberate
	/// swipe. A scrub already armed takes no dead zone, so fine adjustments
	/// keep moving it at once.
	static let deadZonePoints: Double = 100

	/// How long, in seconds, a pan and a press count as one thumb movement. A
	/// scrub armed this soon before a press is the thumb rolling into the
	/// click or sliding to the ring's edge; nobody reads the preview that
	/// fast, so it is cancelled. A pan starting this soon after a press is
	/// the thumb letting go of it.
	static let pressGuardSeconds: Double = 0.3

	/// How long, in seconds, a press counts as held. Longer than any click; a
	/// press held that long, or one whose end never reached the controller,
	/// no longer keeps a pan from being one.
	static let pressHoldLimitSeconds: Double = 2

	/// Seconds moved per pan point at rest — a slow drag gives fine control.
	private static let panBaseSecondsPerPoint: Double = 0.05
	/// Finger velocity (points/sec) at which acceleration reaches 2x base.
	private static let panAccelerationReferenceVelocity: Double = 1000
	/// Curve exponent: >1 keeps slow drags fine and rewards hard flicks.
	private static let panAccelerationPower: Double = 1.5
	/// Acceleration ceiling so a violent flick can't cross a whole film.
	private static let panMaxSecondsPerPoint: Double = 1.0

	/// Seconds a scrub moves for `points` of horizontal pan at `velocity`
	/// (points/sec): the same physical distance covers seconds when dragged
	/// slowly and minutes when flicked (system-player feel).
	static func scrubSeconds(points: Double, velocity: Double) -> Double {
		let boost = pow(abs(velocity) / panAccelerationReferenceVelocity, panAccelerationPower)
		return points * min(panBaseSecondsPerPoint * (1 + boost), panMaxSecondsPerPoint)
	}

	private enum Phase {
		case idle
		/// Travelling the dead zone; the sums are the net movement so far, so
		/// a tremble back and forth never adds up.
		case pending(x: Double, y: Double)
		/// Driving the scrub. `armedAt` is set when this pan armed it.
		case scrubbing(armedAt: Double?)
		/// Done for the rest of this touch.
		case spent
	}

	private var phase: Phase = .idle
	/// When the press still down began; nil when none is.
	private var pressStart: Double?
	private var lastPressEnd = -Double.infinity

	/// A new pan. Returns false when it starts under a press or right after
	/// one, and so will do nothing.
	@discardableResult
	mutating func begin(at time: Double, scrubArmed: Bool) -> Bool {
		let pressHeld = pressStart.map { time - $0 < Self.pressHoldLimitSeconds } ?? false
		if pressHeld || time - lastPressEnd < Self.pressGuardSeconds {
			phase = .spent
			return false
		}
		phase = scrubArmed ? .scrubbing(armedAt: nil) : .pending(x: 0, y: 0)
		return true
	}

	mutating func move(dx: Double, dy: Double, at time: Double) -> Action {
		switch phase {
		case .idle, .spent:
			return .none
		case .scrubbing:
			return .moveScrub(points: dx)
		case .pending(let x, let y):
			let travelX = x + dx
			let travelY = y + dy
			guard max(abs(travelX), abs(travelY)) >= Self.deadZonePoints else {
				phase = .pending(x: travelX, y: travelY)
				return .none
			}
			if abs(travelY) > abs(travelX) {
				phase = .spent
				return .showControls
			}
			// The dead zone only delays the arming: its travel moves the target
			// too, so a swipe moves it as far as it did before the dead zone,
			// when only the recognizer's own start travel was dropped.
			phase = .scrubbing(armedAt: time)
			return .beginScrub(points: travelX)
		}
	}

	/// The player could not start the scrub (not seekable yet, an error up):
	/// the rest of this pan does nothing.
	mutating func refuseScrub() {
		phase = .spent
	}

	/// The thumb lifted. A scrub stays armed; the next pan drives it.
	mutating func end() {
		phase = .idle
	}

	mutating func pressBegan(at time: Double) -> PressAction {
		pressStart = time
		switch phase {
		case .idle, .spent:
			return .none
		case .scrubbing(let armedAt?) where time - armedAt < Self.pressGuardSeconds:
			phase = .spent
			return .cancelScrub
		case .pending, .scrubbing:
			phase = .spent
			return .stopPan
		}
	}

	mutating func pressEnded(at time: Double) {
		pressStart = nil
		lastPressEnd = time
	}
}
