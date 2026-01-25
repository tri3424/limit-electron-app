import { useMemo, useRef, useState, useEffect, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { LogIn, MoveLeft, RefreshCw } from 'lucide-react';
import { HOME_ROUTE } from '@/constants/routes';
import { createAdminAccount, unlockAdminVault, updateAdminAccount } from '@/lib/adminVault';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
	const [showConsole, setShowConsole] = useState(false);

	// Login-page console wizard state (admin creation)
	type ConsoleLine = { id: string; content: ReactNode };
	type WizardStage =
		| 'idle'
		| 'username'
		| 'otp_notice'
		| 'password'
		| 'unlock_code'
		| 'otp_verify'
		| 'edit_current'
		| 'edit_new_username'
		| 'edit_new_password';
	type WizardFlow = 'none' | 'create_admin' | 'unlock_vault' | 'edit_admin';
	const [consoleLines, setConsoleLines] = useState<ConsoleLine[]>([]);
	const [consoleInput, setConsoleInput] = useState('');
	const [wizardStage, setWizardStage] = useState<WizardStage>('idle');
	const [wizardFlow, setWizardFlow] = useState<WizardFlow>('none');
	const [pendingUsername, setPendingUsername] = useState('');
	const [pendingPassword, setPendingPassword] = useState('');
	const [pendingOtp, setPendingOtp] = useState<string | null>(null);
	const [otpCreatedAt, setOtpCreatedAt] = useState<number | null>(null);
	const [otpCopied, setOtpCopied] = useState(false);
	const [unlockOk, setUnlockOk] = useState(false);
	const [editCurrentUsername, setEditCurrentUsername] = useState('');
	const [editNewUsername, setEditNewUsername] = useState('');
	const [editNewPassword, setEditNewPassword] = useState('');
	const consoleScrollRef = useRef<HTMLDivElement | null>(null);
	const consoleInputRef = useRef<HTMLInputElement | null>(null);

	const canDisableClipboard = wizardStage === 'otp_verify';
	const consolePrompt = useMemo(() => {
		switch (wizardStage) {
			case 'username':
				return 'Username:';
			case 'password':
				return 'Password:';
			case 'unlock_code':
				return 'Unlock Code:';
			case 'otp_verify':
				return 'OTP:';
			case 'edit_current':
				return 'Current Username:';
			case 'edit_new_username':
				return 'New Username:';
			case 'edit_new_password':
				return 'New Password:';
			default:
				return 'Command:';
		}
	}, [wizardStage]);

	const pushLine = (content: React.ReactNode) => {
		setConsoleLines((prev) => [...prev, { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, content }]);
	};

	useEffect(() => {
		if (!consoleScrollRef.current) return;
		consoleScrollRef.current.scrollTop = consoleScrollRef.current.scrollHeight;
	}, [consoleLines]);

	useEffect(() => {
		if (wizardStage !== 'idle') {
			setTimeout(() => consoleInputRef.current?.focus(), 0);
		}
	}, [wizardStage]);

  // Redirect if already logged in
  useEffect(() => {
    if (isAuthenticated) {
      navigate(HOME_ROUTE, { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      toast.error('Please enter both username and password');
      return;
    }

    setIsLoading(true);
    try {
      const success = await login(username.trim(), password);
      if (success) {
        toast.success('Login successful');
        // Small delay to ensure state is updated
        setTimeout(() => {
          navigate(HOME_ROUTE);
        }, 100);
      } else {
        toast.error('Invalid username or password');
      }
    } catch (error) {
      console.error('Login error:', error);
      toast.error('An error occurred during login');
    } finally {
      setIsLoading(false);
    }
  };

	const startWizard = () => {
		setWizardFlow('create_admin');
		setWizardStage('username');
		setPendingUsername('');
		setPendingPassword('');
		setPendingOtp(null);
		setOtpCreatedAt(null);
		setOtpCopied(false);
		setUnlockOk(false);
		setEditCurrentUsername('');
		setEditNewUsername('');
		setEditNewPassword('');
		pushLine(
			<span>
				"Please type your Username below in the format Name.Title - For Example creating an username for Rahul Dey, the username should be: Rahul.Dey
				<br />
				<br />
				Username:"
			</span>,
		);
	};

	const startEditWizard = () => {
		setWizardFlow('edit_admin');
		setWizardStage('edit_current');
		setUnlockOk(false);
		setEditCurrentUsername('');
		setEditNewUsername('');
		setEditNewPassword('');
		pushLine('Admin edit mode started.');
		pushLine('Please type the CURRENT admin Username you want to edit:');
	};

	const resetWizard = () => {
		setWizardFlow('none');
		setWizardStage('idle');
		setPendingUsername('');
		setPendingPassword('');
		setPendingOtp(null);
		setOtpCreatedAt(null);
		setOtpCopied(false);
		setUnlockOk(false);
		setEditCurrentUsername('');
		setEditNewUsername('');
		setEditNewPassword('');
	};

	const validateUsernameFormat = (value: string) => {
		const v = value.trim();
		if (!v) return false;
		if (!v.includes('.')) return false;
		if (v.startsWith('.') || v.endsWith('.')) return false;
		if (v.includes(' ')) return false;
		const parts = v.split('.');
		if (parts.length !== 2) return false;
		if (!parts[0] || !parts[1]) return false;
		return /^[A-Za-z]+$/.test(parts[0]) && /^[A-Za-z]+$/.test(parts[1]);
	};

	const generateOtp5 = () => String(Math.floor(10000 + Math.random() * 90000));

	const normalizeCommand = (v: string) => v.trim().replace(/^\\+/, '\\');

	const handleConsoleEnter = async () => {
		const raw = consoleInput;
		const value = raw.trim();
		const normalized = normalizeCommand(value);
		if (!value) return;

		pushLine(
			<span>
				<span className="text-muted-foreground">{consolePrompt}</span> {raw}
			</span>,
		);
		setConsoleInput('');

		if (wizardStage === 'idle') {
			if (normalized === '\\createusername.tempadmin') {
				startWizard();
				return;
			}
			if (normalized === '\\unlockadminvault') {
				setWizardFlow('unlock_vault');
				setWizardStage('unlock_code');
				setUnlockOk(false);
				pushLine('Please type the unlock code (2009) to unlock admin login (valid for 15 minutes).');
				return;
			}
			if (normalized === '\\editadmin') {
				startEditWizard();
				return;
			}
			pushLine('Unknown command.');
			return;
		}

		if (wizardStage === 'edit_current') {
			setEditCurrentUsername(value);
			pushLine('Please type the NEW Username. If you do NOT want to change it, type -');
			setWizardStage('edit_new_username');
			return;
		}

		if (wizardStage === 'edit_new_username') {
			setEditNewUsername(value === '-' ? '' : value);
			pushLine('Please type the NEW Password. If you do NOT want to change it, type -');
			setWizardStage('edit_new_password');
			return;
		}

		if (wizardStage === 'edit_new_password') {
			setEditNewPassword(value === '-' ? '' : raw);
			pushLine('Now type the unlock code (2009) to apply the update.');
			setWizardStage('unlock_code');
			return;
		}

		if (wizardStage === 'username') {
			if (!validateUsernameFormat(value)) {
				pushLine('Invalid format. Please type Username as Name.Title (Example: Rahul.Dey).');
				return;
			}
			setPendingUsername(value);
			const otp = generateOtp5();
			setPendingOtp(otp);
			setOtpCreatedAt(Date.now());
			setWizardStage('otp_notice');
			pushLine(
				<span>
					Your 5-digit OTP is:
					{' '}
					<button
						type="button"
						className="font-mono font-bold underline text-foreground"
						onClick={async () => {
							try {
								await navigator.clipboard.writeText(otp);
								setOtpCopied(true);
								pushLine('OTP copied. It will disappear now. Keep it safe temporarily. Expiry time: 5 minutes.');
							} catch {
								pushLine('Could not copy OTP automatically. Please manually note it down. Expiry time: 5 minutes.');
							}
						}}
					>
						{otpCopied ? '*****' : otp}
					</button>
					.
					{' '}
					Click the OTP to copy it. After copying, it will disappear.
					<br />
					Keep this OTP safe temporarily. Expiry time: 5 minutes.
				</span>,
			);
			pushLine('Please type your Password below (it will be visible):');
			setWizardStage('password');
			return;
		}

		if (wizardStage === 'password') {
			setPendingPassword(raw);
			pushLine('Now type the unlock code (2009). This is required to access and store admin data.');
			setWizardStage('unlock_code');
			return;
		}

		if (wizardStage === 'unlock_code') {
			const ok = unlockAdminVault(value, 15);
			setUnlockOk(ok);
			if (!ok) {
				pushLine('Invalid unlock code. Please type the correct unlock code (2009).');
				return;
			}

			if (wizardFlow === 'unlock_vault') {
				pushLine('Unlock successful. Admin login is now enabled for 15 minutes.');
				resetWizard();
				return;
			}

			if (wizardFlow === 'edit_admin') {
				try {
					await updateAdminAccount(editCurrentUsername, {
						newUsername: editNewUsername || undefined,
						newPassword: editNewPassword || undefined,
					});
					pushLine('CONGRATULATIONS! ADMIN ACCOUNT HAS BEEN UPDATED SUCCESSFULLY.');
				} catch (e: any) {
					pushLine(String(e?.message || 'Could not update admin account.'));
				}
				resetWizard();
				return;
			}

			pushLine('Unlock successful. Now TYPE the OTP. Pasting and Copying are disabled for OTP entry.');
			setWizardStage('otp_verify');
			return;
		}

		if (wizardStage === 'otp_verify') {
			const otp = pendingOtp;
			const createdAt = otpCreatedAt;
			if (!otp || !createdAt) {
				pushLine('No OTP session found. Please start again.');
				resetWizard();
				return;
			}
			const expired = Date.now() - createdAt > 5 * 60_000;
			if (expired) {
				pushLine('OTP expired. Please restart the process.');
				resetWizard();
				return;
			}
			if (value !== otp) {
				pushLine('OTP does not match. Please try again (type it manually).');
				return;
			}
			if (!unlockOk) {
				pushLine('Unlock not detected. Please restart the process.');
				resetWizard();
				return;
			}
			try {
				await createAdminAccount(pendingUsername, pendingPassword);
				pushLine('CONGRATULATIONS! NEW ADMIN USERNAME HAS BEEN CREATED SUCCESSFULLY.');
			} catch (e: any) {
				pushLine(String(e?.message || 'Could not create admin account.'));
			}
			resetWizard();
			return;
		}
	};

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-[linear-gradient(180deg,rgba(255,153,51,0.22)_0%,rgba(255,255,255,0.92)_45%,rgba(19,136,8,0.20)_100%)] p-4 flex items-center justify-center">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 -left-32 h-[520px] w-[520px] rounded-full bg-orange-400/25 blur-3xl" />
        <div className="absolute -bottom-40 -right-40 h-[560px] w-[560px] rounded-full bg-green-400/20 blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage: 'radial-gradient(currentcolor 1px, transparent 1px)',
            backgroundSize: '18px 18px',
          }}
        />
      </div>


      <Card className="relative w-full max-w-md p-6 md:p-8 rounded-2xl shadow-xl border border-border/70 bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/70 ring-1 ring-black/5 max-h-[92vh] overflow-hidden">
			<div className="space-y-6 overflow-y-auto pr-1">
        <div className="text-center space-y-2">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-500/15 via-primary/10 to-green-500/15 border border-border/70 flex items-center justify-center shadow-sm">
            <LogIn className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Welcome</h1>
          <p className="text-sm text-muted-foreground">
            Sign in to continue
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              type="text"
              placeholder="Enter your username"
              value={username}
              onChange={(e) => {
						const v = e.target.value;
						setUsername(v);
						if (v.trim() === '\\console') {
							setShowConsole(true);
							setUsername('');
							setTimeout(() => consoleInputRef.current?.focus(), 0);
						}
					}}
              disabled={isLoading}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
            />
          </div>

          <Button
            type="submit"
            className="w-full uppercase tracking-wide"
            size="lg"
            disabled={isLoading}
          >
            {isLoading ? 'Signing in...' : 'Sign In'}
          </Button>
        </form>

			{showConsole ? (
				<div className="pt-4 border-t border-border/60">
				<div className="flex items-center justify-between gap-3 mb-2">
					<div className="min-w-0">
						<div className="text-xs font-medium text-muted-foreground">Console</div>
						<div className="text-[11px] text-muted-foreground">Admin tools</div>
					</div>
					<div className="flex items-center gap-2 shrink-0">
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() => {
								setShowConsole(false);
								setConsoleLines([]);
								setConsoleInput('');
								resetWizard();
							}}
							className="rounded-full"
						>
							<MoveLeft className="h-4 w-4 mr-2" />
							Back
						</Button>
						<Button
							type="button"
							variant="outline"
							size="icon"
							aria-label="Refresh console"
							onClick={() => {
								setConsoleLines([]);
								setConsoleInput('');
								resetWizard();
							}}
							className="rounded-full"
						>
							<RefreshCw className="h-4 w-4" />
						</Button>
					</div>
				</div>
				<div className="rounded-xl border border-border/70 bg-muted/20 p-3">
					<div
						ref={consoleScrollRef}
						className="h-32 md:h-40 rounded-lg border border-border/70 bg-neutral-950 text-white/90 p-3 font-mono text-xs overflow-auto shadow-inner"
					>
					{consoleLines.length ? (
						consoleLines.map((l) => (
							<div key={l.id} className="whitespace-pre-wrap leading-relaxed">
								{l.content}
							</div>
						))
					) : (
						<div className="text-white/60">
							Type <span className="text-white">\\createusername.tempadmin</span> and press Enter to begin creating a new admin.
						</div>
					)}
					</div>
					<div className="mt-3 flex items-center gap-2">
						<div className="shrink-0 text-xs font-mono text-muted-foreground">{consolePrompt}</div>
						<Input
							ref={consoleInputRef}
							value={consoleInput}
							onChange={(e) => {
								if (wizardStage === 'otp_verify') {
									setConsoleInput(e.target.value.replace(/[^0-9]/g, '').slice(0, 5));
									return;
								}
								setConsoleInput(e.target.value);
							}}
							onKeyDown={(e) => {
								if (e.key === 'Enter') {
									e.preventDefault();
									void handleConsoleEnter();
								}
							}}
							onPaste={(e) => {
								if (canDisableClipboard) e.preventDefault();
							}}
							onCopy={(e) => {
								if (canDisableClipboard) e.preventDefault();
							}}
							onCut={(e) => {
								if (canDisableClipboard) e.preventDefault();
							}}
							placeholder={wizardStage === 'idle' ? 'Type a command…' : 'Type and press Enter…'}
							className="h-9 min-w-0 bg-background"
						/>
						<Button type="button" variant="secondary" className="h-9 shrink-0" onClick={() => void handleConsoleEnter()}>
							Enter
						</Button>
					</div>
				</div>
			</div>
			) : null}
			</div>
      </Card>
    </div>
  );
}

