import Foundation

/// The Apple TV player's clickpad pan. Pausing used to scrub: the thumb that
/// rests on the clickpad and rolls as it clicks armed a scrub (which pauses),
/// moved its target, and the very press meant to pause committed it, so the
/// video jumped and played on. These cases drive TVRemotePanGate through a
/// stand-in for NativePlayerViewController's press handlers.
@main
enum TVRemotePanGateTests {
    static var failures = 0

    static func expect(_ condition: Bool, _ message: @autoclosure () -> String) {
        if !condition {
            failures += 1
            print("FAIL: \(message())")
        }
    }

    enum Button { case select, playPause, left, right }

    /// The parts of NativePlayerViewController and PlayerViewModel a pan or a
    /// press reaches, with the engine reduced to a position and a pause flag.
    /// Kept to the scrub branches of handleSelectPress, handlePlayPausePress
    /// and handleLeft/RightPress; a change there has to be mirrored here.
    struct Player {
        var position = 600.0
        let duration = 3600.0
        var paused = false
        var controlsVisible = false
        var scrubbing = false
        var scrubPosition = 0.0
        var wasPlayingBeforeScrub = false
        var readyToSeek = true
        var gate = TVRemotePanGate()

        mutating func touch(at time: Double) {
            gate.begin(at: time, scrubArmed: scrubbing)
            if scrubbing, !readyToSeek { gate.refuseScrub() }
        }

        mutating func slide(dx: Double, dy: Double = 0, at time: Double, velocity: Double = 600) {
            switch gate.move(dx: dx, dy: dy, at: time) {
            case .none:
                break
            case .showControls:
                controlsVisible = true
            case .beginScrub:
                guard readyToSeek else {
                    gate.refuseScrub()
                    return
                }
                scrubbing = true
                scrubPosition = position
                wasPlayingBeforeScrub = !paused
                paused = true
            case .moveScrub(let points):
                let seconds = TVRemotePanGate.scrubSeconds(points: points, velocity: velocity)
                scrubPosition = min(max(scrubPosition + seconds, 0), duration)
            }
        }

        mutating func lift() {
            gate.end()
        }

        mutating func pressDown(at time: Double) {
            if gate.pressBegan(at: time) == .cancelScrub, scrubbing {
                scrubbing = false
                if wasPlayingBeforeScrub { paused = false }
            }
        }

        mutating func pressUp(_ button: Button, at time: Double) {
            gate.pressEnded(at: time)
            switch button {
            case .select:
                if scrubbing { endScrub() } else { controlsVisible = true }
            case .playPause:
                if scrubbing {
                    endScrub()
                    paused = false
                } else {
                    paused.toggle()
                }
            case .left:
                if scrubbing { scrubPosition -= 10 } else { position -= 10 }
            case .right:
                if scrubbing { scrubPosition += 30 } else { position += 30 }
            }
        }

        mutating func press(_ button: Button, at time: Double) {
            pressDown(at: time)
            pressUp(button, at: time + 0.1)
        }

        private mutating func endScrub() {
            position = scrubPosition
            scrubbing = false
            if wasPlayingBeforeScrub { paused = false }
        }
    }

    static func main() {
        pausingWithTheThumbOnTheClickpad()
        deliberateScrubbing()

        if failures > 0 {
            print("TVRemotePanGate: \(failures) failed")
            exit(1)
        }
        print("TVRemotePanGate tests passed")
    }

    // MARK: - The report: pausing must not move the position

    static func pausingWithTheThumbOnTheClickpad() {
        do {
            // The thumb rests on the clickpad and drifts a little while the
            // other finger goes for Play/Pause.
            var player = Player()
            player.touch(at: 0)
            player.slide(dx: 14, dy: 3, at: 0.02, velocity: 700)
            player.slide(dx: 12, dy: -2, at: 0.04, velocity: 600)
            player.slide(dx: 10, dy: 1, at: 0.06, velocity: 500)
            player.press(.playPause, at: 0.3)
            player.lift()
            expect(player.paused, "drift then Play/Pause: playback is paused")
            expect(!player.scrubbing, "drift then Play/Pause: no scrub is left armed")
            expect(player.position == 600, "drift then Play/Pause: stays at 600, got \(player.position)")
        }
        do {
            // Clicking the centre with the thumb on it: the pad rolls as the
            // switch goes down and again while it is held.
            var player = Player()
            player.touch(at: 0)
            player.slide(dx: 30, dy: 8, at: 0.03, velocity: 2_500)
            player.slide(dx: 25, dy: 6, at: 0.05, velocity: 2_500)
            player.pressDown(at: 0.08)
            player.slide(dx: 40, dy: 10, at: 0.1, velocity: 3_000)
            player.slide(dx: 30, dy: 5, at: 0.12, velocity: 3_000)
            player.pressUp(.select, at: 0.18)
            player.lift()
            expect(!player.scrubbing, "rolling click: no scrub is armed")
            expect(player.position == 600, "rolling click: stays at 600, got \(player.position)")
            expect(!player.paused, "rolling click: Select summons the chrome without pausing")
            expect(player.controlsVisible, "rolling click: Select summons the chrome")
        }
        do {
            // A hard click rolls past the dead zone before the switch goes
            // down: the scrub it armed is the click, not a scrub.
            var player = Player()
            player.touch(at: 0)
            player.slide(dx: 70, dy: 10, at: 0.02, velocity: 3_500)
            player.slide(dx: 60, dy: 8, at: 0.04, velocity: 3_500)
            player.slide(dx: 40, dy: 4, at: 0.06, velocity: 3_000)
            player.pressDown(at: 0.1)
            player.slide(dx: 30, at: 0.12, velocity: 3_000)
            player.pressUp(.playPause, at: 0.2)
            player.lift()
            expect(player.paused, "hard click then Play/Pause: playback is paused")
            expect(!player.scrubbing, "hard click then Play/Pause: no scrub is left armed")
            expect(player.position == 600, "hard click then Play/Pause: stays at 600, got \(player.position)")
        }
        do {
            // Pausing first, then the thumb settles back on the clickpad.
            var player = Player()
            player.press(.playPause, at: 0)
            player.touch(at: 0.15)
            player.slide(dx: 80, at: 0.17, velocity: 1_500)
            player.slide(dx: 80, at: 0.19, velocity: 1_500)
            player.lift()
            expect(player.paused, "settling after Play/Pause: still paused")
            expect(!player.scrubbing, "settling after Play/Pause: no scrub is armed")
            expect(player.position == 600, "settling after Play/Pause: stays at 600, got \(player.position)")
        }
        do {
            // A thumb resting on the clickpad while watching trembles back and
            // forth; that never adds up to a swipe.
            var player = Player()
            player.touch(at: 0)
            for step in 0..<40 {
                let sign: Double = step.isMultiple(of: 2) ? 1 : -1
                player.slide(dx: 45 * sign, dy: 5 * sign, at: Double(step) * 0.05)
            }
            player.lift()
            expect(!player.scrubbing, "trembling thumb: no scrub is armed")
            expect(!player.paused, "trembling thumb: playback goes on")
            expect(!player.controlsVisible, "trembling thumb: the chrome stays hidden")
        }
        do {
            // Second-generation remote: the thumb slides to the ring's edge and
            // clicks it. That is a skip, not a scrub.
            var player = Player()
            player.touch(at: 0)
            for step in 1...6 {
                player.slide(dx: 60, dy: 5, at: Double(step) * 0.02, velocity: 3_000)
            }
            player.press(.right, at: 0.2)
            player.lift()
            expect(!player.scrubbing, "ring click after a slide: no scrub is left armed")
            expect(!player.paused, "ring click after a slide: playback goes on")
            expect(player.position == 630, "ring click after a slide: skips to 630, got \(player.position)")
        }
    }

    // MARK: - Deliberate scrubbing works as before

    static func deliberateScrubbing() {
        do {
            // A clear swipe arms the scrub and moves the target; Select, after
            // a look at the preview, commits it and playback resumes.
            var player = Player()
            player.touch(at: 0)
            for step in 1...10 {
                player.slide(dx: 50, dy: 3, at: Double(step) * 0.03, velocity: 1_200)
            }
            player.lift()
            expect(player.scrubbing, "swipe right: a scrub is armed")
            expect(player.paused, "swipe right: playback pauses while scrubbing")
            expect(player.scrubPosition > 620, "swipe right: the target moves forward, got \(player.scrubPosition)")
            let target = player.scrubPosition
            player.press(.select, at: 1.2)
            expect(!player.scrubbing, "swipe right then Select: the scrub is committed")
            expect(player.position == target, "swipe right then Select: seeks to \(target), got \(player.position)")
            expect(!player.paused, "swipe right then Select: playback resumes")
        }
        do {
            var player = Player()
            player.touch(at: 0)
            for step in 1...10 {
                player.slide(dx: -50, dy: -3, at: Double(step) * 0.03, velocity: 1_200)
            }
            player.lift()
            expect(player.scrubbing, "swipe left: a scrub is armed")
            expect(player.scrubPosition < 580, "swipe left: the target moves back, got \(player.scrubPosition)")
            player.press(.playPause, at: 1.5)
            expect(player.position < 580, "swipe left then Play/Pause: seeks back, got \(player.position)")
            expect(!player.paused, "swipe left then Play/Pause: playback resumes")
        }
        do {
            // Clicking to commit without lifting the thumb: the click's roll
            // must not move the target the user has been looking at.
            var player = Player()
            player.touch(at: 0)
            for step in 1...10 {
                player.slide(dx: 50, at: Double(step) * 0.03, velocity: 1_200)
            }
            let target = player.scrubPosition
            player.pressDown(at: 1.0)
            player.slide(dx: 40, at: 1.02, velocity: 3_000)
            player.slide(dx: 30, at: 1.04, velocity: 3_000)
            player.pressUp(.select, at: 1.1)
            player.lift()
            expect(player.position == target, "commit click with the thumb down: seeks to \(target), got \(player.position)")
        }
        do {
            // Lifting keeps the scrub armed and the next pan moves it at once,
            // in small steps too: fine adjustment has no dead zone.
            var player = Player()
            player.touch(at: 0)
            for step in 1...10 {
                player.slide(dx: 50, at: Double(step) * 0.03, velocity: 1_200)
            }
            player.lift()
            let armed = player.scrubPosition
            player.touch(at: 1.0)
            player.slide(dx: 10, at: 1.02, velocity: 200)
            player.lift()
            let expected = armed + TVRemotePanGate.scrubSeconds(points: 10, velocity: 200)
            expect(abs(player.scrubPosition - expected) < 0.000001,
                   "second pan on an armed scrub: moves to \(expected), got \(player.scrubPosition)")
        }
        do {
            // Arrow presses nudge an armed scrub as before.
            var player = Player()
            player.touch(at: 0)
            for step in 1...10 {
                player.slide(dx: 50, at: Double(step) * 0.03, velocity: 1_200)
            }
            player.lift()
            let armed = player.scrubPosition
            player.press(.right, at: 1.0)
            expect(player.scrubbing, "right press on an armed scrub: still scrubbing")
            expect(player.scrubPosition == armed + 30, "right press on an armed scrub: nudges by 30")
        }
        do {
            // An up or down swipe summons the chrome and never scrubs.
            var player = Player()
            player.touch(at: 0)
            for step in 1...6 {
                player.slide(dx: 4, dy: 50, at: Double(step) * 0.03)
            }
            player.lift()
            expect(player.controlsVisible, "swipe down: the chrome shows")
            expect(!player.scrubbing, "swipe down: no scrub is armed")
            expect(!player.paused, "swipe down: playback goes on")
        }
        do {
            // A swipe a moment after a press is a swipe again.
            var player = Player()
            player.press(.left, at: 0)
            player.touch(at: 0.8)
            for step in 1...10 {
                player.slide(dx: 50, at: 0.8 + Double(step) * 0.03, velocity: 1_200)
            }
            player.lift()
            expect(player.scrubbing, "swipe after a press: a scrub is armed")
        }
        do {
            // A stream that cannot seek yet refuses the scrub, and the rest of
            // that pan does nothing.
            var player = Player()
            player.readyToSeek = false
            player.touch(at: 0)
            for step in 1...10 {
                player.slide(dx: 50, at: Double(step) * 0.03)
            }
            player.lift()
            expect(!player.scrubbing, "not ready to seek: no scrub is armed")
            expect(!player.paused, "not ready to seek: playback goes on")
        }
        do {
            // The pan rate: slow drags are fine, flicks are capped.
            let slow = TVRemotePanGate.scrubSeconds(points: 100, velocity: 0)
            expect(abs(slow - 5) < 0.000001, "100 pt at rest: 5 s, got \(slow)")
            let flick = TVRemotePanGate.scrubSeconds(points: -100, velocity: -50_000)
            expect(flick == -100, "100 pt flicked: capped at 1 s per point, got \(flick)")
        }
    }
}
