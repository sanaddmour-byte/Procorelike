"use client";

interface Member {
  userId: string;
  name: string;
}

interface Props {
  label: string;
  members: Member[];
  selectedUserIds: string[];
  onChange: (userIds: string[]) => void;
}

/** Checkbox list of project directory members for assigning a record to multiple personnel at once (e.g. an RFI's distribution list, alongside its single ball-in-court user). */
export function PersonnelPicker({ label, members, selectedUserIds, onChange }: Props) {
  function toggle(userId: string): void {
    onChange(selectedUserIds.includes(userId) ? selectedUserIds.filter((id) => id !== userId) : [...selectedUserIds, userId]);
  }

  return (
    <div className="flex flex-col gap-1 text-sm">
      <span>{label}</span>
      <div className="flex max-h-40 flex-col gap-1 overflow-y-auto rounded-lg border-3 border-ink px-3 py-2">
        {members.map((m) => (
          <label key={m.userId} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={selectedUserIds.includes(m.userId)} onChange={() => toggle(m.userId)} />
            {m.name}
          </label>
        ))}
      </div>
    </div>
  );
}
