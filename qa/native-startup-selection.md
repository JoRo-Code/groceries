# First server preference after cached startup

Confirmed native-only edge: Firestore persistent cache could show profile/list A immediately, pin A in ListsView, then receive a newer private lastViewedListID B from the server. The previous valid-selection guard preserved A indefinitely. This is separate from the resolved stale web deployment.

Store now captures the first server-confirmed profile preference and signals readiness only after server-confirmed lists have also arrived. ListsView reconciles its cached initial choice once. Any prior tap/drag in the list interface or notification navigation prevents automatic replacement. Later preference changes from another device never move an active reader. This reconciliation performs no Firestore writes; offline cached startup remains usable.

`sh qa/test-native-startup-selection.sh` passes six deterministic checks: cache wait, first-server preference replacing cached choice, later updates ignored, explicit user choice retained, notification priority retained, deleted/missing preference falls back to newest available list. This validates the exact shared selection policy; a full persistent-cache/remote-network timing scenario was not automated.

Final Debug build succeeded. Quick simulator interaction smoke passed: tap Ny vara focused the same TextField and showed the software keyboard; X closed; tapping Bananer moved it into the crossed-off section; dragging the suggestions ScrollView moved its final Tvättmedel/Tandkräm row to the top with the scroll indicator visible. The simultaneous interaction observer did not swallow focus, row taps or scrolling. Screenshots retained locally at /tmp/startup-focus.png, /tmp/startup-row.png and /tmp/startup-suggestions-scroll.png.
