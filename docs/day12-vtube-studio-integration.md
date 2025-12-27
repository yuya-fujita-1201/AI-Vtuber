# Day 12: VTube Studio Integration - Implementation Summary

## Overview
Successfully implemented VTube Studio integration for visual expression sync and volume-based lip sync.

## Implemented Features

### 1. VTube Studio Adapter
**File:** `src/adapters/VTubeStudioAdapter.ts`
- WebSocket connection to VTube Studio API (default port 8001)
- Plugin authentication with token persistence
- Parameter injection for lip sync (MouthOpen)
- Hotkey triggering for expression changes
- Auto-reconnection with exponential backoff
- Request timeout handling (5 seconds)

### 2. Volume Analyzer Service
**File:** `src/services/VolumeAnalyzer.ts`
- WAV buffer analysis for volume extraction
- RMS (Root Mean Square) amplitude calculation
- Support for 8-bit, 16-bit, 24-bit, and 32-bit PCM
- Configurable frame duration (default 16ms = ~60fps)
- Volume normalization to 0.0-1.0 range

### 3. Lip Sync Service
**File:** `src/services/LipSyncService.ts`
- Pre-analysis of audio before playback
- Scheduled parameter updates using setTimeout chain
- Volume smoothing to prevent jittery mouth movement
- Configurable volume scaling (default 1.5x)
- Graceful cancellation and cleanup

### 4. Expression Service
**File:** `src/services/ExpressionService.ts`
- Emotion-to-hotkey mapping for all 5 emotion states
- Debouncing to prevent rapid expression changes (default 500ms)
- Configurable hotkey IDs via environment variables

### 5. Agent Integration
**Modified:** `src/core/Agent.ts`
- Added VTS services to AgentOptions
- Emotion change event emission (`emotion_changed`)
- Expression sync on emotion state changes
- Lip sync integration before audio playback
- Proper cleanup in finally blocks

### 6. Entry Point Wiring
**Modified:** `src/index.ts`
- VTS initialization with feature flag (`VTUBE_STUDIO_ENABLED`)
- Graceful fallback if VTS connection fails
- Dynamic imports for optional VTS dependencies
- Service configuration from environment variables

## Environment Variables

Added to `.env.example`:
```bash
# VTube Studio Integration
VTS_ENABLED=false
VTS_HOST=localhost
VTS_PORT=8001
VTS_AUTH_TOKEN=

# Lip sync settings
VTS_VOLUME_SCALE=1.5

# Expression hotkey IDs
VTS_HOTKEY_NEUTRAL=
VTS_HOTKEY_HAPPY=
VTS_HOTKEY_SAD=
VTS_HOTKEY_ANGRY=
VTS_HOTKEY_EXCITED=
```

## Usage Instructions

### 1. Enable VTube Studio Integration
Add to your `.env` file:
```bash
VTS_ENABLED=true
```

### 2. First-Time Setup (Authentication)
1. Open VTube Studio
2. Start the AI-VTuber application
3. VTube Studio will show a "Plugin Connected" popup - **APPROVE IT**
4. The authentication token will be **automatically saved** to your `.env` file
5. Check the console logs for confirmation:
   ```
   [VTS] ============================================
   [VTS] NEW TOKEN RECEIVED AND SAVED!
   [VTS] Token saved to .env file: VTS_AUTH_TOKEN=...
   [VTS] ============================================
   ```
6. No restart needed - the token is already in use!

### 3. Configure Expression Hotkeys
1. In VTube Studio, go to Settings > Hotkeys
2. Create hotkeys for each emotion (e.g., "Smile", "Sad", "Angry", etc.)
3. Click on each hotkey to see its Hotkey ID
4. Add the IDs to your `.env` file:
   ```bash
   VTS_HOTKEY_HAPPY=your_smile_hotkey_id
   VTS_HOTKEY_SAD=your_sad_hotkey_id
   # etc.
   ```

### 4. Adjust Lip Sync Sensitivity (Optional)
Modify `VTS_VOLUME_SCALE` in `.env`:
- Higher values (e.g., `2.0`) = more mouth movement
- Lower values (e.g., `1.0`) = less mouth movement

## Architecture

### Event Flow
```
User Comment
    ↓
EmotionEngine.update()
    ↓
emotion_changed event → ExpressionService → VTube Studio Hotkey
    ↓
TTS Synthesis
    ↓
VolumeAnalyzer.analyzeWav()
    ↓
LipSyncService.startSync() → Scheduled MouthOpen updates
    ↓
AudioPlayer.play()
    ↓
speaking_end event → LipSyncService.cancelSync()
```

### WebSocket Communication
```
AI-VTuber ←→ WebSocket (port 8001) ←→ VTube Studio
```

- Request/Response pattern with unique request IDs
- 5-second timeout per request
- Auto-reconnection on disconnect (max 5 attempts)

## Technical Details

### Lip Sync Algorithm
1. Parse WAV header to extract sample rate, channels, bits per sample
2. Divide audio into frames (16ms each = 60fps)
3. For each frame:
   - Extract PCM samples
   - Calculate RMS amplitude
   - Normalize to 0.0-1.0
   - Apply scaling factor (default 1.5x)
   - Apply smoothing (30% blend with previous frame)
4. Schedule setTimeout for each frame's timestamp
5. Update VTube Studio MouthOpen parameter at each frame

### Expression Mapping
- **NEUTRAL** → Configured hotkey (e.g., "Default Expression")
- **HAPPY** → Configured hotkey (e.g., "Smile")
- **SAD** → Configured hotkey (e.g., "Sad")
- **ANGRY** → Configured hotkey (e.g., "Angry")
- **EXCITED** → Configured hotkey (e.g., "Excited")

## Verification Checklist

✅ Dependencies installed (`ws`, `@types/ws`)
✅ TypeScript compilation successful
✅ VTube Studio adapter implements IVisualOutputAdapter
✅ Emotion changes emit `emotion_changed` event
✅ Lip sync pre-analyzes WAV before playback
✅ Expression service debounces rapid changes
✅ Graceful fallback when VTS is disabled
✅ Environment variables documented in `.env.example`

## Testing Steps

1. **VTS Connection Test:**
   ```bash
   VTS_ENABLED=true npm start
   ```
   Expected: VTube Studio shows "Plugin Connected" popup and token is automatically saved

2. **Lip Sync Test:**
   - Send a comment to trigger speech
   - Expected: Avatar's mouth moves in sync with audio

3. **Expression Test:**
   - Send positive comments (e.g., "最高！")
   - Expected: Avatar changes to happy expression
   - Send negative comments (e.g., "つまらない")
   - Expected: Avatar changes to sad expression

## Troubleshooting

### Issue: VTS connection fails
**Solution:**
- Ensure VTube Studio is running
- Check that port 8001 is not blocked by firewall
- Verify VTS API is enabled in VTube Studio settings

### Issue: Lip sync not working
**Solution:**
- Check console for `[LipSync]` warnings
- Ensure MouthOpen parameter exists in your VTube Studio model
- Try adjusting `VTS_VOLUME_SCALE` in `.env`

### Issue: Expression changes not visible
**Solution:**
- Verify hotkey IDs are correct in `.env`
- Check that hotkeys are configured in VTube Studio
- Ensure hotkeys have visible effects on your model

## Performance Notes

- Lip sync uses ~60 scheduled timeouts per second of audio
- Minimal CPU impact due to pre-analysis approach
- Expression changes are debounced to prevent spam
- WebSocket messages are lightweight (<1KB each)

## Future Enhancements

Potential improvements for future iterations:
- [ ] Phoneme-based lip sync using Voicevox phoneme data
- [ ] Eye tracking parameters (BlinkLeft, BlinkRight)
- [ ] Head movement parameters (rotation, position)
- [ ] Custom parameter creation via API
- [ ] VTS model parameter discovery and validation
