{
  description = "Listen for HTTP requests over Tailscale and send APNs pushes";

  inputs = {
  };

  outputs = { self, nixpkgs, ... }:
    let
      allSystems = nixpkgs.lib.systems.flakeExposed;
      forAllSystems = nixpkgs.lib.genAttrs allSystems;
      define = f: forAllSystems (system:
        let
          pkgs = import nixpkgs {
            inherit system;
            config = {
            };
          };
        in
          f pkgs
      );
    in {
      devShells = define (pkgs: {
        default = pkgs.mkShell {
          buildInputs = [ pkgs.typescript ];
        };
      });
    };
}
