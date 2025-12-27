export enum IntentType {
    QUESTION = 'QUESTION',
    GREETING = 'GREETING',
    PRAISE = 'PRAISE',
    SPAM = 'SPAM',
    OTHER = 'OTHER'
}

export class IntentClassifier {
    public classify(text: string): IntentType {
        const trimmed = text.trim();
        if (!trimmed) {
            return IntentType.SPAM;
        }

        const normalized = trimmed.toLowerCase();

        if (this.isSpam(normalized)) {
            return IntentType.SPAM;
        }

        if (this.isQuestion(normalized)) {
            return IntentType.QUESTION;
        }

        if (this.isGreeting(normalized)) {
            return IntentType.GREETING;
        }

        if (this.isPraise(normalized)) {
            return IntentType.PRAISE;
        }

        return IntentType.OTHER;
    }

    private isQuestion(text: string): boolean {
        if (text.includes('?') || text.includes('？')) {
            return true;
        }
        return this.containsAny(text, [
            'what',
            'why',
            'how',
            'when',
            'where',
            'who',
            'which',
            'can you',
            'could you',
            'do you',
            'なに',
            '何',
            'どうして',
            'どう',
            'なんで',
            'いつ',
            'どこ',
            '誰'
        ]);
    }

    private isGreeting(text: string): boolean {
        return this.containsAny(text, [
            'hello',
            'hi',
            'hey',
            'good morning',
            'good afternoon',
            'good evening',
            'yo',
            'おはよう',
            'こんにちは',
            'こんばんは',
            'やほ',
            'やっほ',
            'やっほー'
        ]);
    }

    private isPraise(text: string): boolean {
        return this.containsAny(text, [
            'すごい',
            '最高',
            'かわいい',
            '素敵',
            '天才',
            'かっこいい',
            '好き',
            'good job',
            'nice',
            'great',
            'awesome',
            'amazing',
            'love'
        ]);
    }

    private isSpam(text: string): boolean {
        if (this.containsAny(text, ['http://', 'https://', 'www.', '.com', '.net', '.xyz'])) {
            return true;
        }

        if (/^[wｗ]{3,}$/.test(text)) {
            return true;
        }

        if (/(.)\1{4,}/.test(text)) {
            return true;
        }

        return false;
    }

    private containsAny(text: string, patterns: string[]): boolean {
        return patterns.some(pattern => {
            if (!pattern) return false;
            const normalized = pattern.toLowerCase();
            if (/^[a-z]+$/.test(normalized) && normalized.length <= 3) {
                const regex = new RegExp(`\\b${normalized}\\b`, 'i');
                return regex.test(text);
            }
            return text.includes(normalized);
        });
    }
}
