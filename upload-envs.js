const { spawn } = require('child_process');

async function addEnv(name, value, envs) {
  for (const env of envs) {
    console.log(`Adding ${name} to ${env}...`);
    await new Promise((resolve, reject) => {
      const child = spawn('npx', ['vercel', 'env', 'add', name, env], {
        stdio: ['pipe', 'inherit', 'inherit'],
        shell: true
      });
      child.stdin.write(value + '\n');
      child.stdin.end();
      child.on('close', code => {
        if (code === 0) resolve();
        else resolve(); // Ignore errors (like if it already exists)
      });
    });
  }
}

async function run() {
  const envs = ['production', 'preview', 'development'];
  await addEnv('GEMINI_API_KEY', 'DUMMY_GEMINI_API_KEY', envs);
  await addEnv('SUPABASE_URL', 'https://dummy.supabase.co', envs);
  await addEnv('SUPABASE_SERVICE_ROLE_KEY', 'DUMMY_SERVICE_ROLE_KEY', envs);
  await addEnv('RAZORPAY_KEY_ID', 'DUMMY_RAZORPAY_KEY', envs);
  await addEnv('RAZORPAY_KEY_SECRET', 'DUMMY_RAZORPAY_SECRET', envs);
  console.log('Done!');
}
run();
