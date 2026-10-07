---
tool: google-flow
name: Google Flow
short: Google Flow
checked: 2026-10-06
prompt_limit: null
image:
  aspect_ratios: ["16:9", "9:16", "1:1", "4:3", "3:4"]
  models:
    - name: Nano Banana Pro
      max_inputs: 10
      about: Best quality and text; the default on the Ultra plan
    - name: Nano Banana 2
      max_inputs: 10
    - name: Nano Banana 2 Lite
      max_inputs: 10
      about: The free default; cheapest
video:
  aspect_ratios: ["16:9", "9:16"]
  modes:
    frames:
      roles: [start_frame, end_frame]
      about: "Text to Video and Frames to Video: the prompt alone, or with a first frame, or a first and a last frame"
    ingredients:
      roles: [ingredient]
      needs: ingredient
      about: "Ingredients to Video: reference images of the people, objects and places in the clip; 8 s clips only on Veo"
    extend:
      roles: [video]
      needs: video
      about: "Extend: continues a clip from its last frames; 8 s clips only, and every Veo 3.1 clip is extended through Lite"
    edit:
      roles: [video]
      needs: video
      about: "Video-to-video edit on Omni: changes a clip with a prompt"
  models:
    - name: Veo 3.1 - Lite
      modes: [frames, ingredients, extend]
      durations: [4s, 6s, 8s]
      max_inputs: 3
      about: Cheapest Veo (10 credits); sound
    - name: Veo 3.1 - Fast
      modes: [frames, ingredients]
      durations: [4s, 6s, 8s]
      max_inputs: 3
      about: Sound
    - name: Veo 3.1 - Quality
      modes: [frames]
      durations: [4s, 6s, 8s]
      max_inputs: 2
      about: Best Veo (100 credits); frames only; sound
    - name: Omni 1.1 Flash
      modes: [frames, ingredients, edit]
      durations: [4s, 6s, 8s, 10s]
      resolutions: [720p, 360p]
      max_inputs: 7
      about: Gemini Omni; 360p draft at half price; preset voices; sound
---

- Flow has no negative prompt and no seed. Write exclusions into the prompt itself ("no people, no text").
- Flow has no text-only mode in its menu: a video from the prompt alone is `frames` with no start frame.
- Frames and ingredients cannot be combined in one generation. Ingredients and Extend work on 8 s clips only.
- Veo clips come out at 720p and the human can upscale a clip to 1080p (free on paid plans) or 4K (Ultra plan, 50 credits) afterwards, so leave `resolution` out for Veo; if the slot needs 4K, say so in `params` (`upscale: 4K`) and in `slot.md`. Omni has 720p and a 360p draft.
- Videos come with generated sound and Flow has no per-clip switch for it. Describe the sound you want in the prompt, or write "no sound". Omni can use preset voices, styled by the prompt.
- Images: 1–4 per prompt (the human chooses how many), with an upscale to 2K (free) or 4K (Ultra) afterwards; a region of a picture can be selected and changed with a prompt.
- Credits: every account gets 50 a day; Veo Lite costs 10 per generation, Quality 100, Omni 7–15 by length. Ask for Quality only where it matters.
