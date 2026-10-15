{
  description = "Streamyfin dev environment: bun, EAS CLI, iOS build tooling";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";

  outputs =
    { self, nixpkgs }:
    let
      systems = [
        "aarch64-darwin"
        "x86_64-darwin"
        "aarch64-linux"
        "x86_64-linux"
      ];
      forAllSystems =
        f:
        nixpkgs.lib.genAttrs systems (
          system:
          f (
            import nixpkgs {
              inherit system;
              # 1password-cli is the only unfree package let in.
              config.allowUnfreePredicate = pkg: nixpkgs.lib.getName pkg == "1password-cli";
            }
          )
        );
    in
    {
      devShells = forAllSystems (
        pkgs:
        let
          inherit (pkgs) lib;

          # bun must match the version pinned in eas.json ("bun": "1.4.2"):
          # older releases cannot read bun.lock (lockfileVersion 2) and
          # silently re-resolve every dependency.
          jsTools = with pkgs; [
            bun
            nodejs # eas build --local runs its build plugin through npx
            eas-cli
            _1password-cli # op, reads the same op:// references as release.yml
          ];

          # Xcode itself can't come from nix; these can. Taking them from nix
          # keeps rbenv/Homebrew Ruby out of the iOS build.
          iosTools = lib.optionals pkgs.stdenv.isDarwin (
            with pkgs;
            [
              cocoapods
              fastlane
            ]
          );
        in
        {
          # mkShellNoCC on purpose: nix's cc-wrapper must not shadow Xcode clang.
          default = pkgs.mkShellNoCC {
            packages = jsTools ++ iosTools;
          };
        }
      );
    };
}
