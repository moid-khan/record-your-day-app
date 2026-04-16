export type ROStatus = 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED';
export type ActorStatus = 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED';

export type ActorProfile = {
  age?: number;
  height?: number; // in cm
  dominantHand?: 'left' | 'right';
  fullTimeJob?: string; // Previous jobs / current job
  city?: string;
  country?: string;
  taxId?: string;
};

export type User = {
  id: string;
  email: string;
  name?: string;
  phone?: string | null;
  isActor: boolean;
  isAdmin: boolean;
  roStatus: ROStatus;
  actorStatus?: ActorStatus; // Actor approval status
  actorProfile?: ActorProfile | null;
  roProfile?: unknown | null;
  referralCode?: string;
};

export type LoginRequest = {
  email: string;
  password: string;
};

// Mobile login returns token and user at root level (not nested in data)
export type LoginResponse = {
  token: string;
  user: User;
};

export type SignupRequest = {
  email: string;
  password: string;
  isActor: boolean;
  requestRO?: boolean;
  signupToken: string; // JWT from email verification flow (required)
};

export type SignupResponse = {
  success: boolean;
  message: string;
  data: {
    user: User;
    token: string;
  };
};

export type GetMeResponse = {
  success: boolean;
  data: {
    user: User & {
      height?: string;
      fullTimeJob?: string;
      driversLicenseUrl?: string;
      createdAt: string;
    };
  };
};

export type ForgotPasswordRequest = {
  email: string;
};

export type ForgotPasswordResponse = {
  success: boolean;
  message: string;
};

export type ResetPasswordRequest = {
  token: string;
  password: string;
};

export type ResetPasswordResponse = {
  success: boolean;
  message: string;
};

export type UploadDriversLicenseResponse = {
  success: boolean;
  message: string;
  data: {
    url: string;
    key: string;
    filename: string;
    size: number;
  };
};

// OTP types (used for both email and phone verification)
export type OtpType = 'email' | 'phone';

export type SendOtpRequest = {
  identifier: string; // email or phone number
  type: OtpType;
};

export type SendOtpResponse = {
  success: boolean;
  message: string;
};

export type VerifyOtpRequest = {
  identifier: string;
  code: string;
  type: OtpType;
};

export type VerifyOtpResponse = {
  success: boolean;
  message: string;
  signupToken?: string; // JWT returned on email verification for signup
};

export type SaveActorProfileRequest = ActorProfile;

export type SaveActorProfileResponse = {
  success: boolean;
  message: string;
  data?: ActorProfile;
};

export type GetActorProfileResponse = {
  success: boolean;
  data: ActorProfile;
};
