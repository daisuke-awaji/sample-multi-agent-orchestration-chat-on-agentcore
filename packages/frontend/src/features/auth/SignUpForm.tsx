import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ZodError } from 'zod';
import { Donut } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { createSignUpSchema, type SignUpFormData } from '../../schemas/auth';

interface SignUpFormProps {
  onSwitchToLogin: () => void;
}

export const SignUpForm: React.FC<SignUpFormProps> = ({ onSwitchToLogin }) => {
  const { t } = useTranslation();
  const { signUp, isLoading, error, clearError } = useAuthStore();
  const [formData, setFormData] = useState<SignUpFormData>({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));

    // リアルタイムバリデーション
    try {
      if (name === 'confirmPassword') {
        // パスワード確認の場合は全体をチェック
        createSignUpSchema().parse({ ...formData, [name]: value });
      } else {
        // その他のフィールドは個別にチェック
        const fieldSchema = createSignUpSchema().shape[name as keyof SignUpFormData];
        if (fieldSchema) {
          fieldSchema.parse(value);
        }
      }
      setValidationErrors((prev) => ({
        ...prev,
        [name]: '',
      }));
    } catch (err) {
      if (err instanceof ZodError && err.issues?.[0]?.message) {
        setValidationErrors((prev) => ({
          ...prev,
          [name]: err.issues[0].message,
        }));
      }
    }

    // エラーをクリア
    if (error) {
      clearError();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      // バリデーション
      const validatedData = createSignUpSchema().parse(formData);

      // サインアップ実行
      await signUp(validatedData.username, validatedData.password, validatedData.email);
    } catch (err) {
      if (err instanceof ZodError && err.issues) {
        // Zodバリデーションエラー
        const errors: Record<string, string> = {};
        err.issues.forEach((issue) => {
          if (issue.path?.[0]) {
            errors[issue.path[0] as string] = issue.message;
          }
        });
        setValidationErrors(errors);
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-100 via-white to-cyan-100">
      <div className="max-w-md w-full space-y-8 p-8">
        <div className="text-center">
          {/* メインアイコン */}
          <div className="relative mb-6">
            <div className="absolute inset-0 bg-amber-200 rounded-full blur-2xl opacity-30 scale-125"></div>
            <Donut className="w-16 h-16 text-amber-600 mx-auto" />
          </div>
          <h2 className="text-3xl font-bold text-amber-900 mb-2">{t('auth.welcomeTitle')}</h2>
          <p className="text-gray-600">{t('auth.createAccountDescription')}</p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-2">
                {t('auth.username')} <span className="text-red-500">*</span>
              </label>
              <input
                id="username"
                name="username"
                type="text"
                autoComplete="username"
                required
                value={formData.username}
                onChange={handleChange}
                className={`input-field ${
                  validationErrors.username ? 'border-red-300 focus:ring-red-300' : ''
                }`}
                placeholder={t('auth.placeholderUsername')}
              />
              {validationErrors.username && (
                <p className="mt-2 text-sm text-red-600">{validationErrors.username}</p>
              )}
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                {t('auth.email')} <span className="text-red-500">*</span>
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={formData.email}
                onChange={handleChange}
                className={`input-field ${
                  validationErrors.email ? 'border-red-300 focus:ring-red-300' : ''
                }`}
                placeholder={t('auth.placeholderEmail')}
              />
              {validationErrors.email && (
                <p className="mt-2 text-sm text-red-600">{validationErrors.email}</p>
              )}
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                {t('auth.password')} <span className="text-red-500">*</span>
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                value={formData.password}
                onChange={handleChange}
                className={`input-field ${
                  validationErrors.password ? 'border-red-300 focus:ring-red-300' : ''
                }`}
                placeholder={t('auth.placeholderPassword')}
              />
              {validationErrors.password && (
                <p className="mt-2 text-sm text-red-600">{validationErrors.password}</p>
              )}
              <p className="mt-1 text-xs text-gray-500">{t('auth.passwordRequirements')}</p>
            </div>

            <div>
              <label
                htmlFor="confirmPassword"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                {t('auth.confirmPassword')} <span className="text-red-500">*</span>
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                value={formData.confirmPassword}
                onChange={handleChange}
                className={`input-field ${
                  validationErrors.confirmPassword ? 'border-red-300 focus:ring-red-300' : ''
                }`}
                placeholder={t('auth.placeholderConfirmPassword')}
              />
              {validationErrors.confirmPassword && (
                <p className="mt-2 text-sm text-red-600">{validationErrors.confirmPassword}</p>
              )}
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm text-red-800">{error}</p>
                </div>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="button-primary w-full flex justify-center items-center"
          >
            {isLoading ? (
              <>
                <svg
                  className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="m12 2v4m0 12v4m10-10h-4m-12 0H2m15.364-7.364-2.829 2.829m-9.899 9.899-2.829 2.829m12.728 0-2.829-2.829M4.929 4.929l-2.829 2.829"
                  ></path>
                </svg>
                {t('auth.signUpAction')}
              </>
            ) : (
              t('auth.createAccount')
            )}
          </button>
        </form>

        <div className="text-center">
          <p className="text-sm text-gray-600">
            {t('auth.hasAccount')}{' '}
            <button
              type="button"
              onClick={onSwitchToLogin}
              className="font-medium text-indigo-600 hover:text-indigo-500 transition-colors"
            >
              {t('auth.signIn')}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};
