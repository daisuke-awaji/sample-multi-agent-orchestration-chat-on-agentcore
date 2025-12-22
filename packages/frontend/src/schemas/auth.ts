import { z } from 'zod';

// Login form schema
export const loginSchema = z.object({
  username: z
    .string()
    .min(3, 'ユーザー名は3文字以上で入力してください')
    .max(50, 'ユーザー名は50文字以下で入力してください')
    .regex(/^[a-zA-Z0-9_-]+$/, 'ユーザー名は英数字、ハイフン、アンダースコアのみ使用できます'),
  password: z
    .string()
    .min(8, 'パスワードは8文字以上で入力してください')
    .max(128, 'パスワードは128文字以下で入力してください'),
});

export type LoginFormData = z.infer<typeof loginSchema>;

// Sign up form schema
export const signUpSchema = z
  .object({
    username: z
      .string()
      .min(3, 'ユーザー名は3文字以上で入力してください')
      .max(50, 'ユーザー名は50文字以下で入力してください')
      .regex(/^[a-zA-Z0-9_-]+$/, 'ユーザー名は英数字、ハイフン、アンダースコアのみ使用できます'),
    email: z
      .string()
      .min(1, 'メールアドレスを入力してください')
      .email('有効なメールアドレスを入力してください'),
    password: z
      .string()
      .min(8, 'パスワードは8文字以上で入力してください')
      .max(128, 'パスワードは128文字以下で入力してください')
      .regex(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
        'パスワードには小文字、大文字、数字をそれぞれ1文字以上含める必要があります'
      ),
    confirmPassword: z.string().min(1, 'パスワード（確認）を入力してください'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'パスワードが一致しません',
    path: ['confirmPassword'],
  });

export type SignUpFormData = z.infer<typeof signUpSchema>;

// Confirm sign up form schema
export const confirmSignUpSchema = z.object({
  username: z.string().min(1, 'ユーザー名が必要です'),
  code: z
    .string()
    .min(6, '確認コードは6桁で入力してください')
    .max(6, '確認コードは6桁で入力してください')
    .regex(/^\d{6}$/, '確認コードは6桁の数字で入力してください'),
});

export type ConfirmSignUpFormData = z.infer<typeof confirmSignUpSchema>;

// User profile schema
export const userSchema = z.object({
  username: z.string(),
  email: z.string().email().optional(),
  accessToken: z.string(),
  refreshToken: z.string().optional(),
  idToken: z.string().optional(),
});

export type UserData = z.infer<typeof userSchema>;

// Cognito config schema
export const cognitoConfigSchema = z.object({
  userPoolId: z.string().min(1, 'User Pool ID は必須です'),
  clientId: z.string().min(1, 'Client ID は必須です'),
  region: z.string().min(1, 'リージョンは必須です'),
});

export type CognitoConfigData = z.infer<typeof cognitoConfigSchema>;
