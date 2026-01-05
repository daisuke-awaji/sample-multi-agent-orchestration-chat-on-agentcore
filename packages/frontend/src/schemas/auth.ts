import { z } from 'zod';
import i18n from '../i18n';

// Login form schema factory
export const createLoginSchema = () =>
  z.object({
    username: z
      .string()
      .min(3, i18n.t('validation.auth.usernameMinLength'))
      .max(50, i18n.t('validation.auth.usernameMaxLength'))
      .regex(/^[a-zA-Z0-9_-]+$/, i18n.t('validation.auth.usernameInvalidChars')),
    password: z
      .string()
      .min(8, i18n.t('validation.auth.passwordMinLength'))
      .max(128, i18n.t('validation.auth.passwordMaxLength')),
  });

export type LoginFormData = z.infer<ReturnType<typeof createLoginSchema>>;

// Sign up form schema factory
export const createSignUpSchema = () =>
  z
    .object({
      username: z
        .string()
        .min(3, i18n.t('validation.auth.usernameMinLength'))
        .max(50, i18n.t('validation.auth.usernameMaxLength'))
        .regex(/^[a-zA-Z0-9_-]+$/, i18n.t('validation.auth.usernameInvalidChars')),
      email: z
        .string()
        .min(1, i18n.t('validation.auth.emailRequired'))
        .email(i18n.t('validation.auth.emailInvalid')),
      password: z
        .string()
        .min(8, i18n.t('validation.auth.passwordMinLength'))
        .max(128, i18n.t('validation.auth.passwordMaxLength'))
        .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, i18n.t('validation.auth.passwordComplexity')),
      confirmPassword: z.string().min(1, i18n.t('validation.auth.confirmPasswordRequired')),
    })
    .refine((data) => data.password === data.confirmPassword, {
      message: i18n.t('validation.auth.passwordMismatch'),
      path: ['confirmPassword'],
    });

export type SignUpFormData = z.infer<ReturnType<typeof createSignUpSchema>>;

// Confirm sign up form schema factory
export const createConfirmSignUpSchema = () =>
  z.object({
    username: z.string().min(1, i18n.t('validation.auth.usernameRequired')),
    code: z
      .string()
      .min(6, i18n.t('validation.auth.codeLength'))
      .max(6, i18n.t('validation.auth.codeLength'))
      .regex(/^\d{6}$/, i18n.t('validation.auth.codeInvalid')),
  });

export type ConfirmSignUpFormData = z.infer<ReturnType<typeof createConfirmSignUpSchema>>;

// User profile schema
export const userSchema = z.object({
  username: z.string(),
  email: z.string().email().optional(),
  accessToken: z.string(),
  refreshToken: z.string().optional(),
  idToken: z.string().optional(),
});

export type UserData = z.infer<typeof userSchema>;

// Cognito config schema factory
export const createCognitoConfigSchema = () =>
  z.object({
    userPoolId: z.string().min(1, i18n.t('validation.auth.userPoolIdRequired')),
    clientId: z.string().min(1, i18n.t('validation.auth.clientIdRequired')),
    region: z.string().min(1, i18n.t('validation.auth.regionRequired')),
  });

export type CognitoConfigData = z.infer<ReturnType<typeof createCognitoConfigSchema>>;
