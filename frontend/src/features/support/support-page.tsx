"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, Mail } from "lucide-react";
import { PageHeader, Skeleton } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label, Select } from "@/components/ui/input";
import { useGymCodes, useSettings } from "@/hooks/use-data";
import { settingsApi, whatsappApi } from "@/services/api";
import {
  mergeWhatsappTemplates,
  resolveWhatsappTemplateBody,
} from "@/lib/domain/whatsapp";
import { hasAccess, isBranchAdminUser, isMasterOwnerUser } from "@/lib/domain/permissions";
import { useAuthStore } from "@/stores";

const SUPPORT_TEMPLATE_OPTIONS = [
  { key: "reminder", label: "Reminder" },
  { key: "monthReminder", label: "Month-Based Reminder" },
  { key: "success", label: "Success SMS" },
  { key: "fine", label: "Fine SMS" },
  { key: "deactivate", label: "Deactivate SMS" },
  { key: "hold", label: "Hold SMS" },
  { key: "welcome", label: "Welcome SMS" },
] as const;

const MEDICAL_DEFAULT = `Medical Questionnaire
1. Have you ever or do you have any of the following?
Heart Disease(Y/N). Cardiovascular Condition (Y/N). High/Low Blood Pressure (Y/N).
Arthritis (Y/N). Gout Family Hx of Heart Disease (Y/N). Other (Y/N).
2. Do you have any problems/injuries in the follow areas?(Please tick and explain to the best of your ability):
A. Knees. B. Lower Back C. Neck/Shoulders D. Hips/Pelvis Flexibility. Other: ____________
3. Are you pregnant? Yes/No__________ If so, how many week _____________________________________
4. Are you currently doing any regular physical activity, what and how many times per week__________
5. Have you had surgery in the last 5 years, if yes, when & what? _________________________________
6. Do you smoke, if yes how many per day, and for how long have you smoked? _____________________
7. Are you on any medication, if yes what and when do you take? _________________________________
8. Anything else we need to know? (If unsure write it down)_______________________________________`;

const ACK_DEFAULT = `ACKNOWLEDGEMENT RELEASE AND ASSUMPTION OF RISK
Warning: This is an important document that affects your legal rights and obligations. Please read it carefully.

Acknowledgment of Risks, Injury and Obligations
I acknowledge that the activities I am about to undertake involve potential dangers, and by participating in them, I am exposed to certain risks. I understand and agree that while participating in these activities:
- I may suffer physical or mental injury, or even death;
- Any existing physical conditions may be aggravated or worsened;
- My personal property may be lost, stolen, or damaged;
- Other participants may cause me injury or damage my property;
- I may cause injury to others or damage their property;
- The conditions in which the activities are conducted may change without warning;
- I may be injured, die, or suffer damage to my property due to negligence or breach of contract by the Fitness Centre operator, its servants, or agents;
- There may be insufficient or inadequate facilities for treatment or transport if I am injured.

Release and Indemnity to Fitness Centre Operator
I participate in the activities at my sole risk and responsibility.
I release, indemnify, and hold harmless the Fitness Centre Operator, its servants, and agents.

Full Name: [FullName]
DOB: [DOB]
Signature: [Signature]
Date: [Date]`;

const ACK_U18_DEFAULT = `WHERE PARTICIPANT IS UNDER 18 YEARS OF AGE
(Parent/Guardian to read and sign)

I, [ParentGuardianName], being the parent or legal guardian of [FullName], acknowledge and agree:
- I have read the entire document and understand it;
- I consent to the person named participating in the activity;
- I am aware of the risks, dangers, and obligations outlined.

Full Name of Parent / Guardian: [ParentGuardianName]
DOB: [ParentGuardianDOB]
Signature of Parent / Guardian: [ParentGuardianSignature]
DATE: [Date]`;

const GMAIL_DEFAULT = `Hello, [CustomerName]

Warm greetings from Action Plus Gym!

We're thrilled to welcome you to the Action Plus Gym and Fitness Club family. Your membership has been successfully activated, and we're excited to be a part of your fitness journey.

Here are your membership details:
- Current Plan: [CurrentPlan]
- Gym Start Date: [GymStartdate]
- Next Payment Date: [NextPaymentDate]

Let's work together to help you achieve your health and fitness goals. We're here to support and motivate you every step of the way!

Stay strong. Stay consistent. Stay fit!

Best regards,
Team Action Plus Gym & Fitness Club
Email: gymactionplus@gmail.com
Website: www.actionplusgym.com
Phone: +91-7047157510`;

function gymLabel(code: { code?: string; name?: string; label?: string; id?: string }) {
  return code.code
    ? `${code.code}${code.name || code.label ? ` / ${code.name || code.label}` : ""}`
    : code.name || code.label || code.id || "—";
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  } catch {
    toast.error("Could not copy");
  }
}

export function SupportPage() {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const { data: settings, isLoading: settingsLoading } = useSettings();
  const { data: gymCodes = [] } = useGymCodes();

  const canView = hasAccess(user, "support", "viewSupportTemplates");
  const canEdit = hasAccess(user, "support", "editSupportTemplates");
  const mayPickBranch = isMasterOwnerUser(user) || isBranchAdminUser(user);

  const hqId = useMemo(() => {
    const hq = gymCodes.find((g) => String(g.code || "").toUpperCase() === "HQ");
    return String(hq?.id || gymCodes[0]?.id || "");
  }, [gymCodes]);

  const [branchId, setBranchId] = useState("");
  const [templateKey, setTemplateKey] = useState<string>("reminder");
  const [medical, setMedical] = useState(MEDICAL_DEFAULT);
  const [ack, setAck] = useState(ACK_DEFAULT);
  const [ackU18, setAckU18] = useState(ACK_U18_DEFAULT);
  const [gmail, setGmail] = useState(GMAIL_DEFAULT);

  useEffect(() => {
    if (!branchId) {
      const preferred = mayPickBranch
        ? String(user?.activeBranchId || user?.gymCodeId || hqId || "")
        : String(user?.gymCodeId || hqId || "");
      if (preferred) setBranchId(preferred);
    }
  }, [branchId, mayPickBranch, user, hqId]);

  useEffect(() => {
    if (!settings) return;
    setMedical(String(settings.medicalQuestionnaireTemplate || MEDICAL_DEFAULT));
    setAck(String(settings.acknowledgementTemplate || ACK_DEFAULT));
    setAckU18(String(settings.acknowledgementUnder18Template || ACK_U18_DEFAULT));
    setGmail(String(settings.gmailWelcomeTemplate || GMAIL_DEFAULT));
  }, [settings]);

  const effectiveBranchId = mayPickBranch
    ? String(branchId || hqId || "")
    : String(user?.gymCodeId || hqId || "");

  const templatesQuery = useQuery({
    queryKey: ["whatsapp-templates", effectiveBranchId || "default"],
    queryFn: () => whatsappApi.templates(effectiveBranchId || undefined),
    enabled: Boolean(canView && effectiveBranchId),
  });

  const mergedTemplates = useMemo(
    () =>
      mergeWhatsappTemplates(
        templatesQuery.data && typeof templatesQuery.data === "object"
          ? (templatesQuery.data.templates as Record<string, unknown>) ||
              (templatesQuery.data as Record<string, unknown>)
          : null,
      ),
    [templatesQuery.data],
  );

  const selectedBody = resolveWhatsappTemplateBody(templateKey, mergedTemplates);

  const saveSetting = useMutation({
    mutationFn: (patch: Record<string, string>) => settingsApi.bulk(patch),
    onSuccess: async () => {
      toast.success("Template saved");
      await qc.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!canView) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        Support templates access is disabled for this profile.
      </div>
    );
  }

  if (settingsLoading) return <Skeleton className="h-96" />;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Support"
        description="WhatsApp templates and legal/welcome text used across Members and Messaging."
      />

      <Card className="overflow-hidden border-violet-200 shadow-sm dark:border-violet-900">
        <div className="border-b border-violet-100 bg-gradient-to-r from-violet-50 to-white px-4 py-3 dark:border-violet-900 dark:from-violet-950/30 dark:to-card">
          <h2 className="text-sm font-semibold">WhatsApp Support Template Picker</h2>
          <p className="text-xs text-muted-foreground">
            Preview branch templates from production data. Copy or push into Gmail welcome draft.
          </p>
        </div>
        <CardContent className="space-y-3 p-4">
          <div className="grid gap-3 md:grid-cols-2">
            {mayPickBranch ? (
              <div>
                <Label>Branch</Label>
                <Select
                  className="mt-1"
                  value={effectiveBranchId}
                  onChange={(e) => setBranchId(e.target.value)}
                >
                  {gymCodes.map((g) => (
                    <option key={g.id} value={g.id}>
                      {gymLabel(g)}
                    </option>
                  ))}
                </Select>
              </div>
            ) : (
              <div>
                <Label>Branch</Label>
                <p className="mt-1 text-sm text-muted-foreground">
                  {gymLabel(gymCodes.find((g) => g.id === effectiveBranchId) || { id: effectiveBranchId })}
                </p>
              </div>
            )}
            <div>
              <Label>Template</Label>
              <Select
                className="mt-1"
                value={templateKey}
                onChange={(e) => setTemplateKey(e.target.value)}
              >
                {SUPPORT_TEMPLATE_OPTIONS.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <textarea
            readOnly
            className="min-h-[180px] w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm dark:border-border dark:bg-muted/40"
            value={
              templatesQuery.isLoading
                ? "Loading template from production…"
                : selectedBody || "No template body for this key."
            }
          />
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => copyText(selectedBody)}
              disabled={!selectedBody}
            >
              <Copy className="h-3.5 w-3.5" /> Copy Template
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (!selectedBody) return;
                setGmail(selectedBody);
                toast.success("Copied into Gmail welcome draft below");
              }}
              disabled={!selectedBody}
            >
              <Mail className="h-3.5 w-3.5" /> Use in Gmail Draft
            </Button>
          </div>
        </CardContent>
      </Card>

      {(
        [
          {
            key: "medicalQuestionnaireTemplate",
            title: "Medical Questionnaire Template",
            value: medical,
            set: setMedical,
            defaultValue: MEDICAL_DEFAULT,
          },
          {
            key: "acknowledgementTemplate",
            title: "Acknowledgement (Adult)",
            value: ack,
            set: setAck,
            defaultValue: ACK_DEFAULT,
          },
          {
            key: "acknowledgementUnder18Template",
            title: "Acknowledgement (Under 18)",
            value: ackU18,
            set: setAckU18,
            defaultValue: ACK_U18_DEFAULT,
          },
          {
            key: "gmailWelcomeTemplate",
            title: "Gmail Welcome Template",
            value: gmail,
            set: setGmail,
            defaultValue: GMAIL_DEFAULT,
          },
        ] as const
      ).map((card) => (
        <Card key={card.key} className="border-slate-200 shadow-sm dark:border-border">
          <CardContent className="space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">{card.title}</h3>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => card.set(card.defaultValue)}
                  disabled={!canEdit}
                >
                  Reset default
                </Button>
                <Button
                  size="sm"
                  disabled={!canEdit || saveSetting.isPending}
                  onClick={() => saveSetting.mutate({ [card.key]: card.value })}
                >
                  Save
                </Button>
              </div>
            </div>
            <textarea
              className="min-h-[160px] w-full rounded-xl border border-slate-200 bg-white p-3 text-sm disabled:opacity-60 dark:border-border dark:bg-card"
              value={card.value}
              disabled={!canEdit}
              onChange={(e) => card.set(e.target.value)}
            />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
