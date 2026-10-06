---
tool: grok-imagine
name: Grok Imagine
checked: 2026-10-06
prompt_limit: null
image:
  aspect_ratios: ["16:9", "9:16", "1:1", "3:2", "2:3"]
  models:
    - name: Image 2.0
      resolutions: [1K, 2K]
      max_inputs: 5
      about: Quality mode, up to 2048 px; edits a picture with a prompt, from up to 5 source images
video:
  aspect_ratios: ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"]
  modes:
    text:
      roles: []
      about: Text to video from the prompt alone
    frames:
      roles: [start_frame]
      needs: start_frame
      about: "Image to video: animates a picture; the ratio follows it"
    references:
      roles: [reference]
      needs: reference
      about: "Reference to video: pictures of the people or things in the clip, not necessarily as its first frame; preset voices"
    extend:
      roles: [video]
      needs: video
      about: "Extend from frame: adds 2–10 s (6 by default) to a clip of 2–15 s; 720p at most"
    edit:
      roles: [video]
      needs: video
      about: "Video editing: changes a clip of up to 8.7 s with a prompt; keeps its length and ratio; 720p at most"
  models:
    - name: Imagine 1.5
      modes: [text, frames, references, extend, edit]
      durations: [1-15s]
      resolutions: [480p, 720p, 1080p]
      about: 24 fps; native sound (dialogue, music, effects); 4 variations per prompt in the app
---

- The app offers 6 s and 10 s clips (10 s at 720p needs the SuperGrok plan); 1–15 s is the API's range. Ask for 6s or 10s unless the human says their plan allows more.
- 1080p is a SuperGrok feature. The free tier makes no images or video since March 2026, so the human has a paid plan.
- Styles in the app: Normal, Fun, Custom (explicit camera, motion and light directions) and Spicy. Ask for one in `params` (`style: Custom`) when it matters.
- Sound is automatic. Describe the sound you want, put dialogue in quotes, and say "no music" or "silent" when the clip should be quiet.
- Images: the web app offers the five ratios above; the API has more. Edits of several pictures take up to 5 sources.
