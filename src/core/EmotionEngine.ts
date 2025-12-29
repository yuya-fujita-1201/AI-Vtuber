import { config } from '../config/AppConfig';

export enum EmotionState {
    NEUTRAL = 'NEUTRAL',
    HAPPY = 'HAPPY',
    SAD = 'SAD',
    ANGRY = 'ANGRY',
    EXCITED = 'EXCITED'
}

export type VoiceSettings = {
    pitch: number;
    speed: number;
    intonation: number;
};

export type EmotionUpdate = {
    state: EmotionState;
    voice: VoiceSettings;
    changed: boolean;
    score: number;
};

type EmotionSignals = {
    score: number;
    excitement: number;
    anger: number;
};

export class EmotionEngine {
    private state: EmotionState = EmotionState.NEUTRAL;
    private moodScore = 0;
    private readonly decay = config.emotion.decay;
    private overrideState?: EmotionState;
    private overrideUntil?: number;

    private readonly voiceMap: Record<EmotionState, VoiceSettings> =
        config.emotion.voiceMap as Record<EmotionState, VoiceSettings>;

    public update(comment: string, history: string[] = []): EmotionUpdate {
        const now = Date.now();
        if (this.overrideState && this.overrideUntil && now < this.overrideUntil) {
            const changed = this.state !== this.overrideState;
            this.state = this.overrideState;
            return {
                state: this.state,
                voice: this.getVoiceSettings(),
                changed,
                score: this.moodScore
            };
        }

        if (this.overrideState && this.overrideUntil && now >= this.overrideUntil) {
            this.overrideState = undefined;
            this.overrideUntil = undefined;
        }

        const signals = this.analyzeSignals(comment, history);

        const blendedScore = signals.score + this.scoreHistory(history) * config.emotion.historyWeight;
        this.moodScore = this.clamp(
            this.moodScore * this.decay + blendedScore,
            config.emotion.moodClamp.min,
            config.emotion.moodClamp.max
        );

        if (signals.excitement > 0) {
            this.moodScore = this.clamp(
                this.moodScore + config.emotion.excitementBoost,
                config.emotion.moodClamp.min,
                config.emotion.moodClamp.max
            );
        }

        if (signals.anger > 0) {
            this.moodScore = this.clamp(
                this.moodScore - config.emotion.angerPenalty,
                config.emotion.moodClamp.min,
                config.emotion.moodClamp.max
            );
        }

        const nextState = this.deriveState(signals);
        const changed = nextState !== this.state;
        this.state = nextState;

        return {
            state: this.state,
            voice: this.getVoiceSettings(),
            changed,
            score: this.moodScore
        };
    }

    public lockState(state: EmotionState, durationMs: number = config.emotion.lockStateDefaultMs): EmotionUpdate {
        this.overrideState = state;
        this.overrideUntil = Date.now() + durationMs;
        const changed = this.state !== state;
        this.state = state;
        return {
            state: this.state,
            voice: this.getVoiceSettings(),
            changed,
            score: this.moodScore
        };
    }

    public clearOverride(): void {
        this.overrideState = undefined;
        this.overrideUntil = undefined;
    }

    public getCurrentState(): EmotionState {
        return this.state;
    }

    public getVoiceSettings(): VoiceSettings {
        return this.voiceMap[this.state];
    }

    private deriveState(signals: EmotionSignals): EmotionState {
        if (signals.anger > 0 && (signals.score < 0 || this.moodScore <= config.emotion.thresholds.angryMoodMax)) {
            return EmotionState.ANGRY;
        }

        if (signals.score > 0 && signals.excitement > 0 && this.moodScore >= config.emotion.thresholds.excitedMoodMin) {
            return EmotionState.EXCITED;
        }

        if (this.moodScore >= config.emotion.thresholds.happyMoodMin || signals.score > 0) {
            return EmotionState.HAPPY;
        }

        if (this.moodScore <= config.emotion.thresholds.sadMoodMax || signals.score < 0) {
            return EmotionState.SAD;
        }

        return EmotionState.NEUTRAL;
    }

    private analyzeSignals(comment: string, history: string[]): EmotionSignals {
        const text = this.normalizeText([
            history.slice(-config.emotion.historyContextWindow).join(' '),
            comment
        ].filter(Boolean).join(' '));

        const positiveHits = this.countMatches(text, [
            'ありがとう',
            '感謝',
            'うれしい',
            '嬉しい',
            '楽しい',
            '最高',
            'すごい',
            '素敵',
            'かわいい',
            '好き',
            'love',
            'great',
            'awesome',
            'good',
            'nice',
            'amazing',
            'thanks',
            'thank you',
            'やった'
        ]);

        const negativeHits = this.countMatches(text, [
            '悲しい',
            'つらい',
            '辛い',
            '最悪',
            '嫌い',
            'つまらない',
            'だめ',
            'ダメ',
            'うざい',
            '嫌',
            'bad',
            'terrible',
            'awful',
            'hate',
            'sad'
        ]);

        const angerHits = this.countMatches(text, [
            'むか',
            'ムカ',
            'ふざけ',
            '怒',
            'うるさい',
            'キレ',
            'fuck',
            'shit',
            'ばか',
            'バカ'
        ]);

        const exclamationCount = (text.match(/[!！]/g) || []).length;
        const laughCount = (text.match(/[wｗ]{3,}/g) || []).length;
        const cheerCount = text.includes('888') ? 1 : 0;

        const score = this.clamp(
            positiveHits - negativeHits - angerHits,
            config.emotion.moodClamp.min,
            config.emotion.moodClamp.max
        );
        const excitement = Math.min(config.emotion.signalClampMax, exclamationCount + laughCount + cheerCount);
        const anger = Math.min(config.emotion.signalClampMax, angerHits);

        return { score, excitement, anger };
    }

    private scoreHistory(history: string[]): number {
        if (history.length === 0) return 0;
        const text = this.normalizeText(history.slice(-config.emotion.historyScoreWindow).join(' '));
        const positiveHits = this.countMatches(text, ['ありがとう', '最高', '楽しい', '嬉しい', 'love', 'great', 'awesome', 'good']);
        const negativeHits = this.countMatches(text, ['悲しい', '最悪', 'つまらない', '嫌い', 'bad', 'terrible', 'sad']);
        return this.clamp(
            positiveHits - negativeHits,
            config.emotion.moodClamp.min,
            config.emotion.moodClamp.max
        );
    }

    private normalizeText(text: string): string {
        return text.toLowerCase();
    }

    private countMatches(text: string, patterns: string[]): number {
        let count = 0;
        for (const pattern of patterns) {
            if (!pattern) continue;
            if (text.includes(pattern.toLowerCase())) {
                count += 1;
            }
        }
        return count;
    }

    private clamp(value: number, min: number, max: number): number {
        return Math.max(min, Math.min(max, value));
    }
}
