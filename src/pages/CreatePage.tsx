import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CreateSheet } from '@/components/CreateSheet';

export default function CreatePage() {
  const [open, setOpen] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) navigate('/today');
  }, [open, navigate]);

  return <CreateSheet open={open} onOpenChange={setOpen} />;
}
