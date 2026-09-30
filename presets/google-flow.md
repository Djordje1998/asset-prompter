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

- Flow has no negative prompt and no seed control. Put everything in the prompt.
- Video `mode`: `text` takes no inputs; `frames` takes a `start_frame` and optionally an `end_frame`; `ingredients` takes reference images with role `ingredient`. Frames and ingredients cannot be combined.
- With Veo 3.1, `ingredients` mode only generates 8s clips.
- `resolution` applies to Omni Flash only. Leave it out for Veo.
- Image reference images use role `reference`.
