---
tool: leonardo
name: Leonardo.Ai
short: Leonardo
checked: 2026-10-06
prompt_limit: null
image:
  aspect_ratios: ["2:3", "3:2", "1:1", "16:9", "9:16", "4:3", "3:4"]
  models:
    - name: Lucid Origin
      max_inputs: 6
      about: Leonardo's own; up to Full HD, 1440×1440 recommended
    - name: Lucid Realism
      max_inputs: 6
      about: Leonardo's own, photographic
    - name: Phoenix 1.0
      max_inputs: 6
      about: Leonardo's own, older
    - name: GPT Image 2.5
      max_inputs: 6
      about: OpenAI's; text and precise edits
    - name: Nano Banana Pro
      max_inputs: 6
      about: Google's; edits, consistency, native 4K
    - name: Nano Banana 2
      max_inputs: 6
      about: Google's; cheaper
    - name: Seedream 5.0 Pro
      max_inputs: 6
      about: ByteDance's; native 4K
    - name: FLUX.2 Pro
      max_inputs: 6
    - name: FLUX.1 Kontext
      max_inputs: 6
      about: Edits in context
    - name: Ideogram 3.0
      max_inputs: 6
      about: Strong on text in images
video:
  modes:
    text:
      roles: []
      about: Text to video from the prompt alone
    frames:
      roles: [start_frame, end_frame]
      needs: start_frame
      about: "Image to video from a start frame; the models whose row says so take an end frame too"
    references:
      roles: [reference]
      needs: reference
      about: "Reference images (Kling, Seedance); not together with a start or end frame"
    edit:
      roles: [video]
      needs: video
      about: "Video to video (Seedance): changes a clip with a prompt"
  models:
    - name: Veo 3.1
      modes: [text, frames]
      durations: [4s, 6s, 8s]
      resolutions: [720p, 1080p, 4K]
      aspect_ratios: ["16:9", "9:16"]
      about: Google's; sound that cannot be turned off; end frame; paid plans only
    - name: Veo 3.1 Fast
      modes: [text, frames]
      durations: [4s, 6s, 8s]
      resolutions: [720p, 1080p, 4K]
      aspect_ratios: ["16:9", "9:16"]
      about: Cheaper Veo; sound; end frame
    - name: Veo 3.1 Lite
      modes: [text, frames]
      durations: [4s, 6s, 8s]
      resolutions: [720p, 1080p]
      aspect_ratios: ["16:9", "9:16"]
      about: Cheapest Veo; sound; no end frame, no 4K
    - name: Kling 3.0
      modes: [text, frames, references]
      durations: [3-15s]
      resolutions: [720p, 1080p]
      aspect_ratios: ["16:9", "1:1", "9:16"]
      max_inputs: 7
      about: Sound on or off; start and end frame; up to 7 references (4 with a video reference); multi-shot up to 6 cuts
    - name: Kling 3.0 Turbo
      modes: [text, frames, references]
      durations: [3-15s]
      resolutions: [720p, 1080p]
      aspect_ratios: ["16:9", "1:1", "9:16"]
      max_inputs: 7
      about: Faster Kling
    - name: Seedance 2.5
      modes: [text, frames, references, edit]
      about: ByteDance's; up to 4K; sound; camera control; video to video
    - name: Hailuo 2.3
      modes: [text, frames]
      about: The default, in the unlimited (Relaxed) pool; no sound
    - name: Hailuo 2.3 Fast
      modes: [text, frames]
      about: Unlimited pool; no sound
    - name: FLUX 3 Video
      modes: [text, frames]
      about: Up to 20 s, several scenes, native sound
    - name: MiniMax H3
      modes: [text, frames]
      about: 2K, stereo sound, start and end frame
    - name: LTX-2 Pro
      modes: [text, frames]
      about: Native 4K
    - name: Motion 2.0
      modes: [frames]
      durations: [5s]
      about: "Leonardo's own image-to-video, with Motion Controls (strength, pan, tilt, zoom) and Elements"
---

- Leonardo is one place for many models, each with its own length, quality and size choices, and its own price shown on the Generate button. The third-party models (Veo, Seedance, Kling, GPT Image, Nano Banana) are not in the unlimited pool; free accounts get 150 tokens a day.
- Images: Generation Mode Fast or Ultra, 1–8 pictures per run (4 by default, the human's choice), 20+ style presets (Cinematic, Bokeh, Film, Stock Photo …) and a contrast setting on the Lucid models: ask for these in `params` (`style: Cinematic`, `mode: Ultra`). Custom sizes are possible: `params: { width: 1440, height: 1440 }`.
- Image Guidance on the new models: up to 6 reference images, each described in the prompt. The older Style, Content, Character, Depth, Edge and Pose references are on their way out.
- Video: a negative prompt for text-to-video sits under Advanced Settings (`params: { negative_prompt: "…" }`). Whether a model takes an end frame or makes sound is marked in its menu row.
- Editing afterwards: Inline Editor, Universal and Pro Upscaler, background removal.
- Leonardo bills its API separately from the plan, so the human generates in the web app.
