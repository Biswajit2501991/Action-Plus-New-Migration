-- Additive Member Portal Payment Option flags. Does not change payments or existing QR rows.
ALTER TABLE public.payment_qr_settings
  ADD COLUMN IF NOT EXISTS show_in_member_portal boolean NOT NULL DEFAULT false;

ALTER TABLE public.payment_qr_settings
  ADD COLUMN IF NOT EXISTS upi_id text;

COMMENT ON COLUMN public.payment_qr_settings.show_in_member_portal IS
  'When true, this active QR is listed in the Member Portal Payment Option popup.';

COMMENT ON COLUMN public.payment_qr_settings.upi_id IS
  'Optional UPI VPA shown with Copy in Member Portal.';
