import { TopicState } from '../interfaces';

export class TopicSpine {
    private state: TopicState;

    constructor() {
        this.state = {
            currentTopicId: 'topic-001',
            title: 'AI配信テスト',
            outline: ['開始の挨拶', '技術の話', 'FAQ', '締め'],
            currentSectionIndex: 0,
            lockUntil: 0
        };
    }

    public get currentState(): TopicState {
        return { ...this.state };
    }

    public getNextSection(): string | null {
        if (this.state.currentSectionIndex >= this.state.outline.length) {
            return null;
        }
        const section = this.state.outline[this.state.currentSectionIndex];
        this.state.currentSectionIndex++;
        return section;
    }

    public update(action: Partial<TopicState>): void {
        this.state = {
            ...this.state,
            ...action
        };
    }
}
