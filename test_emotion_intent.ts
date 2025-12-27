import { EmotionEngine, EmotionState } from './src/core/EmotionEngine';
import { IntentClassifier, IntentType } from './src/core/IntentClassifier';

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

const runIntentTests = () => {
  console.log('========================================');
  console.log('IntentClassifier Unit Test');
  console.log('========================================');

  const classifier = new IntentClassifier();
  const helloIntent = classifier.classify('Hello');
  assert(helloIntent === IntentType.GREETING, `Expected GREETING, got ${helloIntent}`);

  const wwwIntent = classifier.classify('www');
  assert(
    wwwIntent === IntentType.SPAM || wwwIntent === IntentType.OTHER,
    `Expected SPAM/OTHER, got ${wwwIntent}`
  );

  console.log('✅ IntentClassifier labels look correct.\n');
};

try {
  runEmotionTests();
  runIntentTests();
  console.log('All tests passed ✅');
} catch (error) {
  console.error('Test failed ❌', error);
  process.exit(1);
}
