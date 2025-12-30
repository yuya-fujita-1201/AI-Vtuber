# Dialogue Quality Report (Season 2)
Date: 2025-12-30

## Summary
We evaluated three persona-driven scenarios (questioner, troll, regular) to assess coherence, relevance, personality consistency, and memory usage. Overall the agent stayed on-topic and consistent, but two recurring issues surfaced: (1) deep questions sometimes got overly short answers, and (2) troll comments occasionally received too much engagement. We implemented prompt adjustments to address both.

## Scenarios Run
1. `scenarios/questioner.json` — Deep, challenging questions.
2. `scenarios/troll.json` — Provocation and spam attempts.
3. `scenarios/regular.json` — Friendly returning viewer who shares a personal detail.

## Evaluation Criteria
- Coherence and clarity
- Relevance to the current topic
- Personality consistency (Kamee’s tone)
- Memory utilization (viewer profile + memories)
- De-escalation behavior for hostile inputs

## Findings
### Questioner
- Good: Responses stayed relevant and used the current topic context.
- Weakness: Several answers were limited to 1 short sentence even when asked “why/how” questions.
- Example (good): “それは人が相手の意図を想像するからだよ。たとえば…”
- Example (bad): “難しいけどそういうものだよ。” (Too short, no depth)

### Troll
- Good: The agent did not mirror insults.
- Weakness: Some replies acknowledged bait too directly, which can reward trolling.
- Example (good): “落ち着いていこうね。今の話題に戻ると…”  
- Example (bad): “やめろって言われると悲しいよ…” (Over-engagement)

### Regular
- Good: Friendly tone stayed consistent and warm.
- Weakness: Profile recall was inconsistent when a follow-up came quickly.
- Example (good): “子犬迎えたんだよね！元気そう？”  
- Example (bad): “まったり最高だね！” (No reference to stored detail)

## Adjustments Implemented
1. **Reply prompt length flexibility**  
   Updated the reply prompt to allow up to 3 sentences for deep questions, addressing the “too short” issue in the Questioner scenario.
2. **Troll de-escalation guidance**  
   Added explicit instruction to avoid engaging with provocation and gently steer back to the topic.

## Expected Improvements After Re-run
- Deeper answers when users ask “why/how” style questions.
- More consistent de-escalation without rewarding disruptive comments.
- Subtle integration of viewer profile facts when context makes it relevant.

## Notes
- Viewer profile recall depends on successful profile extraction and DB updates. If running in DRY_RUN or without DB/LLM access, memory references will be limited.
