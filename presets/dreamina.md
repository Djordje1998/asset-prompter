---
tool: dreamina
name: Dreamina
checked: 2026-10-06
prompt_limit: null
image:
  aspect_ratios: ["1:1", "3:4", "16:9", "4:3", "9:16", "2:3", "3:2", "21:9"]
  models:
    - name: Image 5.0 Pro
      resolutions: [1.5K, 2K, 4K]
      max_inputs: 6
      about: Seedream 5.0 Pro; best quality
    - name: Image 5.0 Lite
      resolutions: [1.5K, 2K]
      max_inputs: 6
      about: Seedream 5.0 Lite; faster and cheaper
    - name: GPT Image 2
      max_inputs: 6
      about: OpenAI's model; strong on text and on edits
    - name: Nano Banana
      max_inputs: 6
      about: Google's model; strong on edits and consistency
video:
  aspect_ratios: ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"]
  modes:
    references:
      roles: [reference, video, audio]
      about: "Omni Reference: up to 30 images, 10 clips (2–30 s, 30 s in all) and 10 audio files, tagged with @ in the prompt; the prompt alone makes text-to-video"
    frames:
      roles: [start_frame, end_frame]
      about: "First and Last Frames: a first frame, or a first and a last"
    edit:
      roles: [video]
      needs: video
      about: "Smart Edit: changes a clip with a prompt, or with marks (boxes, arrows, points) drawn on a frame"
    extend:
      roles: [video]
      needs: video
      about: "Extend Video: adds 4–30 s to a clip shorter than 30 s, chained up to 60 s"
    long:
      roles: [reference]
      about: "Long Video (beta): 30–180 s in one pass"
  models:
    - name: Seedance 2.5
      modes: [references, frames, edit, extend, long]
      durations: [4-180s]
      resolutions: [480p, 720p]
      max_inputs: 50
      about: 4–30 s per generation, 30–180 s only in long mode; 24 fps; native sound (music, effects, dialogue)
    - name: Seedance 2.0 Fast
      modes: [references, frames]
      resolutions: [480p, 720p]
      about: Cheaper and quicker; sound
---

- Length is any whole number of seconds from 4 to 30 in one generation; `long` mode makes 30–180 s (beta). Most slots need far less: ask for the shortest clip that does the job.
- Resolution: the interface shows "720P+"; the 1080p and 4K in the marketing are not confirmed, so count on 720p and ask for Creative Upscale afterwards if the slot needs more.
- Sound is native: music, effects and dialogue. "No subtitles" and "no background music" in the prompt work. Put dialogue in quotes and say who says it; it is best in English, Chinese, Spanish, Indonesian and Malay.
- Timestamps in the prompt ("0–3 s: …, 3–6 s: …") control the clip second by second.
- References are tagged in the prompt as `@image1`, `@video1`, `@audio1`, in the order they are attached: an image lends a look, a video lends motion or camera work, an audio file lends its sound or rhythm.
- Images: 1–4 per batch (the human chooses); text-to-image, image-to-image and multi-image modes; Creative Upscale to 2K–8K afterwards.
- Dreamina is CapCut's (ByteDance) web app at dreamina.capcut.com.
