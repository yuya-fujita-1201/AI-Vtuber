import { EmotionEngine, EmotionState } from '../EmotionEngine';
import { config } from '../../config/AppConfig';

describe('EmotionEngine', () => {
  it('raises mood score and switches to HAPPY for positive input', () => {
    const engine = new EmotionEngine();
    const result = engine.update('great');

    const expectedScore = Math.max(
      config.emotion.moodClamp.min,
      Math.min(config.emotion.moodClamp.max, 1)
    );

    expect(result.score).toBeCloseTo(expectedScore, 5);
    expect(result.state).toBe(EmotionState.HAPPY);
    expect(result.changed).toBe(true);
  });

  it('lowers mood score and switches to SAD for negative input', () => {
    const engine = new EmotionEngine();
    const result = engine.update('terrible');

    const expectedScore = Math.max(
      config.emotion.moodClamp.min,
      Math.min(config.emotion.moodClamp.max, -1)
    );

    expect(result.score).toBeCloseTo(expectedScore, 5);
    expect(result.state).toBe(EmotionState.SAD);
    expect(result.changed).toBe(true);
  });

  it('applies excitement boost and can reach EXCITED', () => {
    const engine = new EmotionEngine();
    const result = engine.update('great!!!');

    const baseScore = 1;
    const boostedScore = Math.max(
      config.emotion.moodClamp.min,
      Math.min(config.emotion.moodClamp.max, baseScore + config.emotion.excitementBoost)
    );

    expect(result.score).toBeCloseTo(boostedScore, 5);
    expect(result.state).toBe(EmotionState.EXCITED);
  });

  it('applies anger penalty and switches to ANGRY when anger signals appear', () => {
    const engine = new EmotionEngine();
    const result = engine.update('fuck');

    const baseScore = -1;
    const penalizedScore = Math.max(
      config.emotion.moodClamp.min,
      Math.min(config.emotion.moodClamp.max, baseScore - config.emotion.angerPenalty)
    );

    expect(result.score).toBeCloseTo(penalizedScore, 5);
    expect(result.state).toBe(EmotionState.ANGRY);
  });
});
