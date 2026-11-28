<?php
// Read-only fixture bridge for the isolated launch database. Never prints invitation credentials.
$app = require __DIR__.'/launch-app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
$email = getenv('CLAIM_TEST_EMAIL');
if (!is_string($email) || !preg_match('/^membership\.[a-z0-9.]+@example\.test$/D', $email)) throw new RuntimeException('Local fixture email required');
$user = App\Models\User::withoutGlobalScopes()->where('email', $email)->sole();
$invite = App\Models\EmailVerificationCode::where('user_id', $user->id)->where('purpose', 'claim')->whereNull('verified_at')->latest('id')->firstOrFail();
$dir = realpath(dirname(getenv('LAUNCH_FIXTURE')));
if (!$dir || str_starts_with(strtolower(str_replace('\\','/',$dir)), strtolower(str_replace('\\','/',dirname(__DIR__,2))))) throw new RuntimeException('Private fixture path required');
file_put_contents($dir.'/membership-invitation-private.json', json_encode(['email'=>$email,'code'=>$invite->code]));
echo "Local invitation fixture prepared.\n";
