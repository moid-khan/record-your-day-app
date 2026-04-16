import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type {
  SendOtpRequest,
  SendOtpResponse,
  VerifyOtpRequest,
  VerifyOtpResponse,
  SaveActorProfileRequest,
  SaveActorProfileResponse,
  GetActorProfileResponse,
} from '../types/auth';

// Query keys
export const onboardingKeys = {
  all: ['onboarding'] as const,
  actorProfile: () => [...onboardingKeys.all, 'actorProfile'] as const,
};

// Send OTP mutation (works for both email and phone)
export function useSendOtp() {
  return useMutation({
    mutationFn: async (data: SendOtpRequest) => {
      const response = await api.post<SendOtpResponse>(
        '/auth/send-otp',
        data,
        false, // no auth required for email OTP during signup
      );
      return response;
    },
  });
}

// Verify OTP mutation (works for both email and phone)
export function useVerifyOtp() {
  return useMutation({
    mutationFn: async (data: VerifyOtpRequest) => {
      const response = await api.post<VerifyOtpResponse>(
        '/auth/verify-otp',
        data,
        false, // no auth required for email OTP during signup
      );
      return response;
    },
  });
}

// Verify Phone OTP (requires auth - for post-signup phone verification)
export function useVerifyPhoneOtp() {
  return useMutation({
    mutationFn: async (data: VerifyOtpRequest) => {
      const response = await api.post<VerifyOtpResponse>(
        '/auth/verify-otp',
        data,
        true, // requires auth for phone verification after signup
      );
      return response;
    },
  });
}

// Save Actor Profile mutation
export function useSaveActorProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: SaveActorProfileRequest) => {
      const response = await api.post<SaveActorProfileResponse>(
        '/user/actor-profile',
        data,
        true, // requires auth
      );
      return response;
    },
    onSuccess: () => {
      // Invalidate actor profile query to refetch
      queryClient.invalidateQueries({ queryKey: onboardingKeys.actorProfile() });
    },
  });
}

// Get Actor Profile query
export function useActorProfile(enabled = true) {
  return useQuery({
    queryKey: onboardingKeys.actorProfile(),
    queryFn: async () => {
      const response = await api.get<GetActorProfileResponse>(
        '/user/actor-profile',
        true, // requires auth
      );
      return response.data;
    },
    enabled,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
