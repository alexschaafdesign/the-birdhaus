import DoorPersonForm from '@/components/admin/DoorPersonForm';

export default function NewDoorPersonPage() {
  return (
    <main className="max-w-6xl mx-auto px-6 pb-16 pt-6">
      <DoorPersonForm mode="create" />
    </main>
  );
}
