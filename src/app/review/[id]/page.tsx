import ReviewWorkspace from "@/components/review-workspace";

export const dynamic = "force-dynamic";

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ReviewWorkspace reviewId={id} />;
}
