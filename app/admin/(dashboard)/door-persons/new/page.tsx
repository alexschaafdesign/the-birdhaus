import DoorPersonForm from '@/components/admin/DoorPersonForm';

export default function NewDoorPersonPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 pt-8 pb-16 sm:px-8">
      <DoorPersonForm mode="create" />
    </main>
  );
}
