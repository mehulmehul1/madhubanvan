# Upstream base

This folder is a **fork** of `procedural-animals` by Majid Manzarpour (MIT).

- Repo: https://github.com/majidmanzarpour/threejs-procedural-animals
- Base commit: `c95ae49` ("More natural animal motion and fur fixes")
- Cloned: into `experiments/madhubani-animals/` (nested `.git` removed so the
  KnowledgeBase monorepo tracks our changes)

## What we change vs upstream

Only the render layer is ported to TSL/WebGPU, plus the Madhubani coat mode.
Everything else (species data, SDF sculpt, mesher, weights, DQS math, motion/IK,
actions, build pipeline, worker) stays verbatim. See
`~/.commandcode/plans/madhubani-animals-tsl.md`.

To diff against upstream in future:

```
git clone https://github.com/majidmanzarpour/threejs-procedural-animals.git /tmp/pa-upstream
git -C /tmp/pa-upstream checkout c95ae49
# then diff /tmp/pa-upstream/src against experiments/madhubani-animals/src
```
