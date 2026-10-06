---
tool: luma
name: Luma Dream Machine
short: Luma
checked: 2026-10-06
prompt_limit: null
image:
  models:
    - name: Uni-1.1
      aspect_ratios: ["3:1", "2:1", "16:9", "3:2", "1:1", "2:3", "9:16", "1:2", "1:3"]
      max_inputs: 9
      about: "Create Image and Modify Image; up to 9 references, each with a role; seed; about 2048 px, chosen automatically"
    - name: Uni-1
      aspect_ratios: ["3:1", "2:1", "16:9", "3:2", "1:1", "2:3", "9:16", "1:2", "1:3"]
      max_inputs: 9
      about: Older Uni
    - name: Photon
      aspect_ratios: ["1:1", "3:4", "4:3", "9:16", "16:9", "9:21", "21:9"]
      about: Older; batches of 4
    - name: Photon Flash
      aspect_ratios: ["1:1", "3:4", "4:3", "9:16", "16:9", "9:21", "21:9"]
      about: Fastest
video:
  aspect_ratios: ["9:16", "3:4", "1:1", "4:3", "16:9", "21:9"]
  modes:
    text:
      roles: []
      about: Text to video from the prompt alone
    frames:
      roles: [start_frame, end_frame, keyframe]
      about: "Image to video: a start frame, an end frame, and on Ray3.2 up to 16 keyframes in one clip"
    edit:
      roles: [video, reference]
      needs: video
      about: "Modify Video: restyles a clip (Motion and Structure settings, pose and face tracking, motion transfer); keeps its sound; up to 20 s at 24 fps"
    reframe:
      roles: [video]
      needs: video
      about: "Reframe: a clip of up to 12 s in another aspect ratio"
    extend:
      roles: [video]
      needs: video
      about: "Extend: continues a clip, up to about a minute"
  models:
    - name: Ray3.2
      modes: [text, frames, edit, reframe, extend]
      durations: [5s, 10s]
      resolutions: [360p, 540p, 720p, 1080p]
      max_inputs: 16
      about: Newest; no sound; HDR and EXR export
    - name: Ray3.14
      modes: [text, frames, edit, extend]
      durations: [5s, 10s]
      resolutions: [360p, 540p, 720p, 1080p]
      about: Fast and cheap; loop; HDR only at 540p and 720p
    - name: Ray3
      modes: [text, frames, extend]
      durations: [5s, 10s]
      resolutions: [540p, 720p, 1080p]
      about: Character reference; Hi-Fi
---

- Luma makes silent clips from text and images; only Modify Video and Reframe keep the sound of the source. If a slot needs sound, say so in `slot.md` so the human adds it elsewhere.
- Resolution: 720p is the default; 1080p costs four times as much (Ray3.2, 5 s: 20, 50, 100 and 400 credits for 360p, 540p, 720p and 1080p; 10 s costs three times that). Use the 360p draft for tries and 1080p only for the final clip.
- HDR: 16-bit HDR and EXR export (ACES2065-1) for colour grading, at 2× (HDR) or 3× (HDR and EXR) the price: `params: { hdr: true }`.
- Modify Video takes .mp4, .mov and .wmv; up to 20 s at 24 fps, 15 s at 30 fps, 7 s at 60 fps. Loop is on Ray3.14 and Ray3 only.
- Images: in Modify Image the ratio is locked to the source. Each reference gets a role in the interface (the thing, the style, the background): name them in the prompt.
- Luma bills its API separately from the plan, so the human generates in the web app.
