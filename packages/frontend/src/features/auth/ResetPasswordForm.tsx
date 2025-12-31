import React, { useState } from 'react';
import { ZodError, z } from 'zod';
import { Donut, ArrowLeft, CheckCircle } from 'lucide-react';
import { confirmResetPassword } from '../../lib/cognito';

interface ResetPasswordFormProps {
  email: string;
  onSuccess?: () => void;
  onBack?: () => void;
}

const resetPasswordSchema = z
  .object({
    code: z.string().min(6, '確認コードは6桁以上必要です'),
    newPassword: z
      .string()
      .min(8, 'パスワードは8文字以上必要です')
      .regex(/[A-Z]/, 'パスワードには大文字を含む必要があります')
      .regex(/[a-z]/, 'パスワードには小文字を含む必要があります')
      .regex(/[0-9]/, 'パスワードには数字を含む必要があります'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'パスワードが一致しません',
    path: ['confirmPassword'],
  });

type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>;

export const ResetPasswordForm: React.FC<ResetPasswordFormProps> = ({
  email,
  onSuccess,
  onBack,
}) => {
  const [formData, setFormData] = useState<ResetPasswordFormData>({
    code: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [isSuccess, setIsSuccess] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));

    // リアルタイムバリデーション
    try {
      if (name === 'confirmPassword') {
        resetPasswordSchema.parse({ ...formData, [name]: value });
      } else {
        resetPasswordSchema.shape[name as keyof typeof resetPasswordSchema.shape].parse(value);
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

    if (error) {
      setError(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      // バリデーション
      const validatedData = resetPasswordSchema.parse(formData);

      setIsLoading(true);
      setError(null);

      // パスワードリセット実行
      await confirmResetPassword(email, validatedData.code, validatedData.newPassword);

      // 成功表示
      setIsSuccess(true);

      // 2秒後にログイン画面へ
      setTimeout(() => {
        if (onSuccess) {
          onSuccess();
        }
      }, 2000);
    } catch (err) {
      if (err instanceof ZodError && err.issues) {
        const errors: Record<string, string> = {};
        err.issues.forEach((issue) => {
          if (issue.path?.[0]) {
            errors[issue.path[0] as string] = issue.message;
          }
        });
        setValidationErrors(errors);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('パスワードのリセットに失敗しました');
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full space-y-8 p-8 text-center">
          <div className="relative mb-6">
            <div className="absolute inset-0 bg-green-200 rounded-full blur-2xl opacity-30 scale-125"></div>
            <CheckCircle className="w-16 h-16 text-green-600 mx-auto" />
          </div>
          <h2 className="text-3xl font-bold text-gray-900 mb-2">パスワードをリセットしました</h2>
          <p className="text-gray-600">新しいパスワードでログインしてください</p>
          <div className="flex justify-center">
            <svg className="animate-spin h-8 w-8 text-amber-600" fill="none" viewBox="0 0 24 24">
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
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8 p-8">
        <div className="text-center">
          <div className="relative mb-6">
            <div className="absolute inset-0 bg-amber-200 rounded-full blur-2xl opacity-30 scale-125"></div>
            <Donut className="w-16 h-16 text-amber-600 mx-auto" />
          </div>
          <h2 className="text-3xl font-bold text-amber-900 mb-2">パスワードをリセット</h2>
          <p className="text-gray-600 text-sm">
            メールに送信された確認コードと新しいパスワードを入力してください
          </p>
          <p className="text-gray-600 text-sm mt-2">
            メールアドレス: <span className="font-semibold">{email}</span>
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label htmlFor="code" className="block text-sm font-medium text-gray-700 mb-2">
                確認コード
              </label>
              <input
                id="code"
                name="code"
                type="text"
                required
                value={formData.code}
                onChange={handleChange}
                className={`input-field ${
                  validationErrors.code ? 'border-red-300 focus:ring-red-300' : ''
                }`}
                placeholder="6桁の確認コードを入力"
              />
              {validationErrors.code && (
                <p className="mt-2 text-sm text-red-600">{validationErrors.code}</p>
              )}
            </div>

            <div>
              <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 mb-2">
                新しいパスワード
              </label>
              <input
                id="newPassword"
                name="newPassword"
                type="password"
                autoComplete="new-password"
                required
                value={formData.newPassword}
                onChange={handleChange}
                className={`input-field ${
                  validationErrors.newPassword ? 'border-red-300 focus:ring-red-300' : ''
                }`}
                placeholder="新しいパスワードを入力"
              />
              {validationErrors.newPassword && (
                <p className="mt-2 text-sm text-red-600">{validationErrors.newPassword}</p>
              )}
              <p className="mt-2 text-xs text-gray-500">
                8文字以上、大文字・小文字・数字を含む必要があります
              </p>
            </div>

            <div>
              <label
                htmlFor="confirmPassword"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                パスワード確認
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
                placeholder="パスワードを再入力"
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
                パスワードをリセット中...
              </>
            ) : (
              'パスワードをリセット'
            )}
          </button>
        </form>

        <div className="text-center space-y-2">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="flex items-center justify-center w-full text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              戻る
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
