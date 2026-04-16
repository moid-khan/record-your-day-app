## Product: Creator Recording & Task Execution Platform

## Purpose

Enable contractors to onboard, browse tasks, record video/voice/role-play tasks with
real-time CV guidance, upload outputs, and receive payouts.

# 1. Scope

This PRD defines the end-to-end system for onboarding, task discovery, task execution,
real-time CV validation, recording (video, audio, role-play), uploading, and payout
tracking. It also defines admin-configurable CV rules and task-type logic.

# 2. Task Types

1. **Video Tasks**
   Capture video with real-time CV checks (e.g., hands-visible logic). Will include
   audio.
2. **Voice Tasks**
   Capture voice-only audio. May show scripts or prompts. Recording starts via
   button.
3. **Role-Play Tasks**
   Video + audio with audio instructions during recording. Voice diction required.

# 3. Real-Time CV Rules (Configurable Per

# Task)

Admin must be able to toggle each rule ON/OFF:
● **Start Condition**
○ Option A: “Start” voice command + both hands visible.

○ Option B: Only “Start” button.
○ Plays a “DING” confirmation on success.
● **Ongoing Recording Conditions**
○ At least one full hand must remain in frame unless the task explicitly
requires no hand checks.
○ Hands-not-required mode passes all hand checks.
○ FPS must remain above 30.
○ Resolution must remain above 1080p.

# 4. Recording Requirements

### Video Recording

● Real-time CV overlay (hand boxes, status indicators).
● Audio captured automatically as part of video mode.

### Voice Recording

● Button-based start/stop.
● Optional on-screen script.
● Optional waveform preview.

### Role-Play Recording

● Audio cue system that plays instructions while recording.
● Behaves like video recording with additional timed audio guidance.

# 5. Upload & Payment Requirements

● Upload raw video/audio files.
● Update task state after upload completion.
● Trigger payout logic.

● Payout status visible in user profile.

# 6. User Flows

## 6.1 Onboarding

● Simple questionnaire.
○ Name
○ Email
○ Phone number
○ Height
○ Full time job (if any)
○ Drivers license upload
● Profile creation.
● Permissions request (camera, mic, notifications).
● Admin approval (empty tasks until admin approval)

## 6.2 Task Browsing

● List view of tasks with indicators:
○ Task type: video, voice, role-play.
○ Whether CV checks are enabled.
● Task detail page:
○ Description, requirements, expected duration, constraints
○ Category of task
○ Ability to propose a task (from user) -> send to admin board -> when
admin approves it shows up as a pre-approved task on dashboard

## 6.3 Accept Task

● Accept button.
● Task moves to “accepted” state.
● Ready for recording.

## 6.4 Recording Execution

● Open recording UI based on task type.
● CV overlay active when enabled.
● Admin-defined start conditions enforced.
● Audio instructions (role-play tasks).
● Error handling (permissions, FPS/resolution, CV failures).

## 6.5 Upload & Completion

● Auto-upload or manual confirmation.
● Completion state shown.
● Payment triggered.
● Payout status visible in profile.

# 7. Admin Requirements

● Enable/disable CV rules per task.
● Configure start condition logic.
● Configure whether hands must be in frame.
● Manage tasks, scripts, and audio cue files.

# 8. Milestones

## Milestone 1 – UX & Flow Skeleton

● Onboarding + questionnaire flow skeleton
● Task browsing + task detail skeletons (+Admin side adding)
● Recording UI skeletons for: video, voice, role-play
○ Video tasks flow: accept task, instructions, record screen, say “start”, hand
in frame detector, beeps at minute mark of task (if task is 25 minutes)
“recording time ended”
○ Voice tasks flow: accept task, text on screen / instructions, mic record
button

○ Role play flow: accept task, instructions, say “start”, reads instructions of
what to do out loud to you
○ All of them: when finished task then you get final screen with checks +
final payment amount
● CV overlay skeleton
● CV rules defined + placeholder states
○ Detect hands using a lightweight hand-detector and classify them based
solely on whether the detected hand region is fully inside the camera
frame.
○ A hand is considered valid if its bounding box (or landmark bounds) does
not touch or cross any image edge (apply a small margin such as 5%).
○ Hands that are occluded but still fully inside the frame are treated as valid,
while hands that are partially in frame—i.e., any part of the detected
region lies outside the image boundary—are treated as invalid. Temporal
smoothing over recent frames ensures the signal is stable and prevents
flicker.
● Upload + payout status skeleton
● Flow sign-off

## Milestone 2 – Task Browsing & Profile

● User profile + questionnaire
● Task list + detail pages
● Indicators for voice + role-play tasks
● Indicators for CV checks enabled/disabled
● Task acceptance wired to APIs
● Accepted/completed task states

## Milestone 3 – Recording (Video + Audio) + CV

● Full video recording
● Full voice recording mode
● Role-play audio cue system
● Real-time CV checks when enabled
● Max recording length enforcement

● Permissions + all error states

## Milestone 4 – Upload & Payment

● Video/audio upload integration
● Task completion update flow
● Payment trigger integration
● Payout visibility in profile

# 9. Non-Functional Requirements

● Stable FPS monitoring.
● Graceful failure handling.
● Mobile-optimized UI.
● Structured logs for CV events.

# 10. Sign-off Criteria

● All task types fully recordable.
● CV logic configurable and functional.
● Upload pipeline reliable.
● Payment flow triggered correctly.
● Profile reflects all task states and payouts.
