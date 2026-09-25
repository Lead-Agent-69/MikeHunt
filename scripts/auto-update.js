const { execSync } = require('child_process');

console.log(`\n[${new Date().toISOString()}] Starting Auto-Update...`);
try {
  const pullOutput = execSync('git pull', { encoding: 'utf8' });
  console.log(pullOutput);

  if (!pullOutput.includes('Already up to date.') && !pullOutput.includes('up-to-date')) {
    console.log('🚀 Changes detected! Running CI checks...');
    execSync('npm run test', { stdio: 'inherit' });
    execSync('npm run typecheck', { stdio: 'inherit' });
    execSync('npx eslint .', { stdio: 'inherit' });
    execSync('npm run build', { stdio: 'inherit' });
    
    console.log('🔄 Rebuilding and restarting Docker scraper to apply new code...');
    execSync('docker compose -f docker-compose.scrape.yml --profile cron build', { stdio: 'inherit' });
    execSync('docker compose -f docker-compose.scrape.yml --profile cron up -d', { stdio: 'inherit' });
    console.log('✅ Update complete!');
  } else {
    console.log('💤 No new changes in Git. Skipping CI checks and keeping scraper running uninterrupted.');
  }
} catch (error) {
  console.error('❌ Auto-update failed:', error);
  process.exit(1);
}
