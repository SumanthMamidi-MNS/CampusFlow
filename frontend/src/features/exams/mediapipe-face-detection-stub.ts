/**
 * Build-time stand-in for `@mediapipe/face_detection`.
 *
 * The assessment's face check runs the TF.js runtime of
 * `@tensorflow-models/face-detection` (`runtime: 'tfjs'`), which needs none of
 * the MediaPipe solution's WebAssembly. The package still imports the solution
 * at module scope, so the bundler has to be able to resolve the specifier —
 * `vite.config.ts` points it here.
 *
 * Bundling the real solution instead would add several megabytes of WASM to an
 * assessment page for a code path this application never instantiates, and it
 * is a peer dependency `npm install` fetches separately: an appraisal that has
 * to work on an exam laptop is not the place for that download.
 *
 * This is not a mock of behaviour the app uses. If a future change selects
 * `runtime: 'mediapipe'`, construction fails loudly with the reason rather than
 * misbehaving quietly — remove the alias together with that change.
 */
export class FaceDetection {
  constructor() {
    throw new Error(
      'The MediaPipe face_detection solution is not bundled. CampusFlow runs the TF.js runtime ' +
        '(@tensorflow-models/face-detection with runtime: "tfjs"); see frontend/vite.config.ts.'
    );
  }
}
