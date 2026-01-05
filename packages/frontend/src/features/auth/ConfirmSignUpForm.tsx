import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ZodError } from 'zod';
import { Donut } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { createConfirmSignUpSchema, type ConfirmSignUpFormData } from '../../schemas/auth';

interface ConfirmSignUpFormProps {
  username: string;
  onSwitchToLogin: () => void;
  onBack: () => void;
}

export const ConfirmSignUpForm: React.FC<ConfirmSignUpFormProps> = ({
  username,
  onSwitchToLogin,
  onBack,
}) => {
  const { t } = useTranslation();
  const { confirmSignUp, resendCode, isLoading, error, clearError } = useAuthStore();
  const [formData, setFormData] = useState<ConfirmSignUpFormData>({
    username,
    code: '',
  });
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [resendSuccess, setResendSuccess] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;

    // 確認コードは数字のみ、6桁まで
    if (name === 'code') {
      const numericValue = value.replace(/\D/g, '').slice(0, 6);
      setFormData((prev) => ({
        ...prev,
        [name]: numericValue,
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        [name]: value,
      }));
    }

    // リアルタイムバリデーション
    try {
      const fieldSchema = createConfirmSignUpSchema().shape[name as keyof ConfirmSignUpFormData];
      if (fieldSchema) {
        const testValue = name === 'code' ? value.replace(/\D/g, '').slice(0, 6) : value;
        fieldSchema.parse(testValue);
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
    setResendSuccess(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      // バリデーション
      const validatedData = createConfirmSignUpSchema().parse(formData);

      // 確認実行
      await confirmSignUp(validatedData.username, validatedData.code);

      // 成功時はログイン画面へ
      onSwitchToLogin();
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

  const handleResendCode = async () => {
    try {
      setResendSuccess(false);
      await resendCode(username);
      setResendSuccess(true);
    } catch {
      // エラーは authStore で処理済み
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-100 via-white to-emerald-100">
      <div className="max-w-md w-full space-y-8 p-8">
        <div className="text-center">
          {/* メインアイコン */}
          <div className="relative mb-4">
            <div className="absolute inset-0 bg-amber-200 rounded-full blur-2xl opacity-30 scale-125"></div>
            <Donut className="w-12 h-12 text-amber-600 mx-auto mb-2" />
          </div>
          <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 mb-4">
            <svg
              className="h-6 w-6 text-green-600"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="1.5"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"
              />
            </svg>
          </div>
          <h2 className="text-3xl font-bold text-amber-900 mb-2">
            {t('auth.welcomeTitle')} - {t('auth.emailVerification')}
          </h2>
          <p className="text-gray-600">
            <strong>{username}</strong> {t('auth.enterCodeSentTo')}
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label htmlFor="code" className="block text-sm font-medium text-gray-700 mb-2">
                {t('auth.verificationCodeLabel')} <span className="text-red-500">*</span>
              </label>
              <input
                id="code"
                name="code"
                type="text"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                required
                value={formData.code}
                onChange={handleChange}
                className={`input-field text-center text-lg tracking-widest ${
                  validationErrors.code ? 'border-red-300 focus:ring-red-300' : ''
                }`}
                placeholder="000000"
              />
              {validationErrors.code && (
                <p className="mt-2 text-sm text-red-600">{validationErrors.code}</p>
              )}
              <p className="mt-1 text-xs text-gray-500">{t('auth.verificationCodeDescription')}</p>
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

          {resendSuccess && (
            <div className="bg-green-50 border border-green-200 rounded-2xl p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm text-green-800">{t('auth.resendCodeSuccess')}</p>
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-col space-y-3">
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
                  {t('auth.confirmAction')}
                </>
              ) : (
                t('auth.confirmAccount')
              )}
            </button>

            <button
              type="button"
              onClick={handleResendCode}
              disabled={isLoading}
              className="w-full px-4 py-2 border border-gray-300 rounded-2xl text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {t('auth.resendCode')}
            </button>
          </div>
        </form>

        <div className="flex flex-col space-y-2 text-center">
          <button
            type="button"
            onClick={onBack}
            className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            {t('common.backArrow')} {t('auth.backToSignUp')}
          </button>
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
