import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const classItems = [
  {
    id: "artisan-bread",
    title: "Artisan Bread Basics",
    description: "Learn fermentation, shaping, and baking for signature loaves.",
    image:
      "https://images.unsplash.com/photo-1455274111113-575d080ce8cd?auto=format&fit=crop&w=1200&q=80",
  },
  {
    id: "croissant-lab",
    title: "Croissant Lamination Lab",
    description: "Master folds, butter locks, and premium flaky finishes.",
    image:
      "https://images.unsplash.com/photo-1558326567-98ae2405596b?auto=format&fit=crop&w=1200&q=80",
  },
  {
    id: "cake-decor",
    title: "Cake Decoration Studio",
    description: "Practice smooth frosting, piping, and celebration designs.",
    image:
      "https://images.unsplash.com/photo-1614707267537-b85aaf00c4b7?auto=format&fit=crop&w=1200&q=80",
  },
];

export default function ClassesPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-4xl text-[#2D1F16]">Baking Classes</h1>
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {classItems.map((item) => (
          <Card key={item.id} className="overflow-hidden">
            <div className="relative h-48">
              <Image src={item.image} alt={item.title} fill className="object-cover" />
            </div>
            <CardHeader>
              <CardTitle className="font-serif text-2xl">{item.title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-[#5f4637]">{item.description}</p>
              <Button>Book Now</Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

