import { EmotionEngine, EmotionState } from './src/core/EmotionEngine';

const assert = (condition: boolean, message: string) => {
  if (!condition) {
    throw new Error(message);
  }
};

const runEmotionTests = () => {
  console.log('========================================');
  console.log('EmotionEngine Unit Test');
  console.log('========================================');

  const happy = new EmotionEngine();
  const happyUpdate = happy.update('ありがとう', []);
  assert(happyUpdate.state === EmotionState.HAPPY, `Expected HAPPY, got ${happyUpdate.state}`);

  const sad = new EmotionEngine();
  const sadUpdate = sad.update('悲しい', []);
  assert(sadUpdate.state === EmotionState.SAD, `Expected SAD, got ${sadUpdate.state}`);

  const angry = new EmotionEngine();
  const angryUpdate = angry.update('ふざけんな！', []);
  assert(angryUpdate.state === EmotionState.ANGRY, `Expected ANGRY, got ${angryUpdate.state}`);

  const excited = new EmotionEngine();
  const excitedUpdate = excited.update('やったー！！', []);
  assert(excitedUpdate.state === EmotionState.EXCITED, `Expected EXCITED, got ${excitedUpdate.state}`);

  console.log('✅ EmotionEngine transitions look correct.\n');
};

try {
  runEmotionTests();
  console.log('All tests passed ✅');
} catch (error) {
  console.error('Test failed ❌', error);
  process.exit(1);
}
