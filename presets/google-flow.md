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
  aspect_ratios: ["16:9", "4:3", "1:1", "3:4", "9:16"]
video:
  models:
    - name: Veo 3.1 - Lite
      modes: [frames, ingredients]
      durations: [8s]
      max_inputs: 3
    - name: Veo 3.1 - Fast
      modes: [frames, ingredients]
      durations: [8s]
      max_inputs: 3
    - name: Veo 3.1 - Quality
      modes: [frames]
      durations: [8s]
    - name: Omni 1.1 Flash
      modes: [frames, ingredients]
      durations: [4s, 6s, 8s, 10s]
      resolutions: [720p, 360p]
      max_inputs: 7
  aspect_ratios: ["16:9", "9:16"]
---

- Flow has no negative prompt and no seed. Write exclusions into the prompt itself ("no people, no text").
- Veo 3.1 models always make 8s clips; only Omni 1.1 Flash lets you choose the length.
- Flow has no text-only mode: a video from the prompt alone is `frames` with no start frame.
- Videos come with generated sound and Flow has no per-clip switch for it. Describe the sound you want in the prompt, or write "no sound".
