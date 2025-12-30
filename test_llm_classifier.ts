import { LLMClassifierService } from './src/services/LLMClassifierService';

const samples = [
  'おはよう！今日もかわいいね！',
  'それって本当？どうしてそう思うの？',
  '888888',
  '次の話題に変えて！',
  '最高だね（棒）',
  'www',
  'フォロワー買いませんか？ https://spam.example.com'
];

const run = async () => {
  const classifier = new LLMClassifierService();

  for (const comment of samples) {
    const result = await classifier.classify(comment, { currentTopic: '雑談' });
    const sum = result.emotion.positive + result.emotion.negative + result.emotion.neutral;
    console.log('----------------------------------------');
    console.log('Comment:', comment);
    console.log('Result:', result);
    console.log('Emotion sum:', sum.toFixed(2));
  }
};

run().catch((error) => {
  console.error('LLM classifier test failed', error);
  process.exit(1);
});
