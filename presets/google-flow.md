---
tool: google-flow
name: Google Flow
prompt_limit: null
image:
  models:
    - name: Nano Banana Pro
      max_inputs: 10
    - name: Nano Banana 2
      max_inputs: 10
    - name: Nano Banana 2 Lite
      max_inputs: 10
  aspect_ratios: ["16:9", "9:16", "1:1", "3:4", "4:3"]
  outputs: [1, 2, 3, 4]
video:
  models:
    - name: Veo 3.1 - Lite
      modes: [text, frames, ingredients]
      durations: [4s, 6s, 8s]
      max_inputs: 3
    - name: Veo 3.1 - Fast
      modes: [text, frames, ingredients]
      durations: [4s, 6s, 8s]
      max_inputs: 3
    - name: Veo 3.1 - Quality
      modes: [text, frames]
      durations: [4s, 6s, 8s]
    - name: Omni Flash
      modes: [text, frames, ingredients]
      durations: [4s, 6s, 8s, 10s]
      resolutions: [720p, 360p]
      max_inputs: 7
  aspect_ratios: ["16:9", "9:16"]
  outputs: [1, 2, 3, 4]
---

- Flow has no negative prompt and no seed. Write exclusions into the prompt itself ("no people, no text").
- Veo 3.1 models generate only 8s clips in `ingredients` mode.
- Videos come with generated sound and Flow has no per-clip switch for it. Describe the sound you want in the prompt, or write "no sound".
