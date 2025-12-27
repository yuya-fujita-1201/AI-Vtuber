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
    private readonly decay = 0.6;

    private readonly voiceMap: Record<EmotionState, VoiceSettings> = {
        [EmotionState.NEUTRAL]: { pitch: 0, speed: 1.0, intonation: 1.0 },
        [EmotionState.HAPPY]: { pitch: 0.05, speed: 1.1, intonation: 1.2 },
        [EmotionState.SAD]: { pitch: -0.05, speed: 0.9, intonation: 0.8 },
        [EmotionState.ANGRY]: { pitch: 0.02, speed: 1.15, intonation: 1.3 },
        [EmotionState.EXCITED]: { pitch: 0.08, speed: 1.2, intonation: 1.4 }
    };

    public update(comment: string, history: string[] = []): EmotionUpdate {
        const signals = this.analyzeSignals(comment, history);

        const blendedScore = signals.score + this.scoreHistory(history) * 0.2;
        this.moodScore = this.clamp(this.moodScore * this.decay + blendedScore, -2, 2);

        if (signals.excitement > 0) {
            this.moodScore = this.clamp(this.moodScore + 0.4, -2, 2);
        }

        if (signals.anger > 0) {
            this.moodScore = this.clamp(this.moodScore - 0.4, -2, 2);
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

    public getCurrentState(): EmotionState {
        return this.state;
    }

    public getVoiceSettings(): VoiceSettings {
        return this.voiceMap[this.state];
    }

    private deriveState(signals: EmotionSignals): EmotionState {
        if (signals.anger > 0 && (signals.score < 0 || this.moodScore <= -0.6)) {
            return EmotionState.ANGRY;
        }

        if (signals.score > 0 && signals.excitement > 0 && this.moodScore >= 1.0) {
            return EmotionState.EXCITED;
        }

        if (this.moodScore >= 0.4 || signals.score > 0) {
            return EmotionState.HAPPY;
        }

        if (this.moodScore <= -0.8 || signals.score < 0) {
            return EmotionState.SAD;
        }

        return EmotionState.NEUTRAL;
    }

    private analyzeSignals(comment: string, history: string[]): EmotionSignals {
        const text = this.normalizeText([history.slice(-2).join(' '), comment].filter(Boolean).join(' '));

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

        const score = this.clamp(positiveHits - negativeHits - angerHits, -2, 2);
        const excitement = Math.min(2, exclamationCount + laughCount + cheerCount);
        const anger = Math.min(2, angerHits);

        return { score, excitement, anger };
    }

    private scoreHistory(history: string[]): number {
        if (history.length === 0) return 0;
        const text = this.normalizeText(history.slice(-3).join(' '));
        const positiveHits = this.countMatches(text, ['ありがとう', '最高', '楽しい', '嬉しい', 'love', 'great', 'awesome', 'good']);
        const negativeHits = this.countMatches(text, ['悲しい', '最悪', 'つまらない', '嫌い', 'bad', 'terrible', 'sad']);
        return this.clamp(positiveHits - negativeHits, -2, 2);
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
