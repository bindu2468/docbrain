/**
 * Branding configuration for the DocBrain API
 *
 * This file centralizes all branding-related strings and values.
 * Used for easy rebranding and future localization/i18n support.
 */

export const branding = {
  /**
   * Application name
   */
  appName: 'DocBrain',

  /**
   * Email configuration
   */
  email: {
    /**
     * Email addresses
     */
    addresses: {
      from: 'noreply@docbrain.local',
      support: 'support@docbrain.local',
      domain: 'docbrain.local',
    },

    /**
     * Default sender names
     */
    fromName: 'DocBrain',
    fromNameDev: 'DocBrain Dev',

    /**
     * Logo and alt text
     */
    logo: {
      altText: 'DocBrain Logo',
      defaultAltText: 'Organization Logo',
    },

    /**
     * Email template text
     */
    templates: {
      defaultTitle: 'DocBrain',
      copyright: (year: number) => `© ${year} DocBrain. All rights reserved.`,
      helpText: (contactEmail: string) => `Need help? Contact us at ${contactEmail}`,
    },
  },

  /**
   * Email subject lines
   */
  emailSubjects: {
    verification: 'Verify your DocBrain email address',
    passwordReset: 'DocBrain - Password Reset Request',
    otpVerification: 'Your DocBrain Verification Code',
    userInvitation: (organizationName: string) =>
      `You're invited to join ${organizationName} on DocBrain`,
    invitationAccepted: (organizationName: string) => `Welcome to ${organizationName} on DocBrain`,
  },

  /**
   * Email body text
   */
  emailBody: {
    verification: {
      greeting: (firstName: string) => `Hi ${firstName},`,
      signupThanks: 'Thank you for signing up for DocBrain!',
      verifyPrompt: 'Please verify your email address by clicking the button below:',
      ignoreNotice: "If you didn't create a DocBrain account, you can safely ignore this email.",
    },
    passwordReset: {
      resetPrompt:
        'We received a request to reset your password for your DocBrain account. If you made this request, click the button below to reset your password:',
    },
    otpVerification: {
      codePrompt: 'Your verification code for DocBrain is:',
    },
    userInvitation: {
      invitationText: (inviterName: string, organizationName: string, roleName: string) =>
        `${inviterName} has invited you to join ${organizationName} on DocBrain as a ${roleName}.`,
      welcomeText: 'Welcome to DocBrain!',
    },
    invitationAccepted: {
      welcomeText: (organizationName: string, roleName: string) =>
        `Congratulations! You have successfully joined ${organizationName} on DocBrain as a ${roleName}.`,
    },
  },

  /**
   * Service defaults
   */
  service: {
    defaultOrganizationName: 'DocBrain',
  },

  /**
   * Frontend URLs
   */
  urls: {
    frontend: process.env.FRONTEND_URL || 'http://localhost:3000',
  },
} as const;

/**
 * Type-safe branding access
 */
export type Branding = typeof branding;
