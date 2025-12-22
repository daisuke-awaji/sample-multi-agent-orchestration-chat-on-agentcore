import React, { useState } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { LoginForm } from './LoginForm';
import { SignUpForm } from './SignUpForm';
import { ConfirmSignUpForm } from './ConfirmSignUpForm';

type AuthMode = 'login' | 'signup' | 'confirm';

export const AuthContainer: React.FC = () => {
  const { needsConfirmation, pendingUsername, setNeedsConfirmation } = useAuthStore();
  const [userMode, setUserMode] = useState<'login' | 'signup'>('login');

  // モードを動的に決定（確認が必要な場合は優先）
  const currentMode: AuthMode = needsConfirmation && pendingUsername ? 'confirm' : userMode;

  const handleSwitchToLogin = () => {
    setUserMode('login');
    setNeedsConfirmation(false);
  };

  const handleSwitchToSignUp = () => {
    setUserMode('signup');
    setNeedsConfirmation(false);
  };

  const handleBackToSignUp = () => {
    setUserMode('signup');
    setNeedsConfirmation(false);
  };

  switch (currentMode) {
    case 'signup':
      return <SignUpForm onSwitchToLogin={handleSwitchToLogin} />;

    case 'confirm':
      return (
        <ConfirmSignUpForm
          username={pendingUsername || ''}
          onSwitchToLogin={handleSwitchToLogin}
          onBack={handleBackToSignUp}
        />
      );

    case 'login':
    default:
      return <LoginForm onSwitchToSignUp={handleSwitchToSignUp} />;
  }
};
