"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { DNACarousel, type CarouselItem } from "@/components/ui/dna-carousel";
import { VerticalCarousel3D, type VerticalCarouselItem } from "@/components/ui/vertical-carousel-3d";
import { EditorialCard, EditorialGrid, type EditorialCardData } from "@/components/ui/editorial-card";
import { FanCardCarousel, type FanCardItem } from "@/components/ui/fan-card-carousel";
import { FocusSliceCarousel, type FocusSliceItem } from "@/components/ui/focus-slice-carousel";
import { CinemaCarousel, type CinemaItem } from "@/components/ui/cinema-carousel";
import { PolaroidGrid, type PolaroidFlipItem } from "@/components/ui/polaroid-flip-card";
import { PremiumCarousel, type PremiumCarouselItem } from "@/components/ui/premium-carousel";
import { ImageHoverRevealGrid, type ImageHoverRevealItem } from "@/components/ui/image-hover-reveal";
import { VerticalMediaFlow, type VerticalMediaItem } from "@/components/ui/vertical-media-flow";
import { StackDriftCarousel, type StackDriftItem } from "@/components/ui/stack-drift-carousel";
import { VideoDeckCarousel, type VideoDeckItem } from "@/components/ui/video-deck-carousel";
import { DrawerCardGrid, type DrawerCardItem } from "@/components/ui/ui-drawer-card";

// ── Sample Data ──
const showcaseItems: CarouselItem[] = [
  { id: "1", image: "https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800&q=80", title: "Porsche 911 Carrera", subtitle: "2019 · 12,400 miles", category: "Sports Car", year: "2019", description: "Immaculate condition with full service history. Guards Red over Black leather.", cta: "View Deal" },
  { id: "2", image: "https://images.unsplash.com/photo-1555215695-3004980ad54e?w=800&q=80", title: "BMW M4 Competition", subtitle: "2021 · 8,200 miles", category: "Performance", year: "2021", description: "S58 twin-turbo inline-6. Portimao Blue with extended Merino leather.", cta: "View Deal" },
  { id: "3", image: "https://images.unsplash.com/photo-1583121274602-3e2820c69888?w=800&q=80", title: "Audi RS6 Avant", subtitle: "2020 · 15,800 miles", category: "Wagon", year: "2020", description: "591hp twin-turbo V8 with quattro AWD.", cta: "View Deal" },
  { id: "4", image: "https://images.unsplash.com/photo-1605559424843-9e4c228bf1c2?w=800&q=80", title: "Mercedes-AMG GT", subtitle: "2018 · 22,100 miles", category: "Grand Tourer", year: "2018", description: "Handcrafted biturbo V8. Obsidian Black with Red Pepper interior.", cta: "View Deal" },
  { id: "5", image: "https://images.unsplash.com/photo-1617531653332-bd46c24f2068?w=800&q=80", title: "Tesla Model S Plaid", subtitle: "2022 · 5,400 miles", category: "Electric", year: "2022", description: "Tri-motor AWD. 0-60 in 1.99s. Full Self-Driving capability.", cta: "View Deal" },
];

const verticalItems: VerticalCarouselItem[] = [
  { id: "v1", image: "https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=800&q=80", title: "Ford Mustang GT", subtitle: "2020 · 18,200 miles", category: "Muscle", description: "5.0L V8 with active exhaust. Rapid Red with Recaro seats." },
  { id: "v2", image: "https://images.unsplash.com/photo-1553440569-bcc63803a83d?w=800&q=80", title: "Chevrolet Corvette", subtitle: "2021 · 9,800 miles", category: "Sports Car", description: "Mid-engine LT2 V8. Torch Red with GT2 bucket seats." },
  { id: "v3", image: "https://images.unsplash.com/photo-1607853202273-797f1c22a38e?w=800&q=80", title: "Dodge Challenger", subtitle: "2019 · 25,400 miles", category: "Muscle", description: "Supercharged Hellcat. 717hp. TorRed with Alcantara interior." },
  { id: "v4", image: "https://images.unsplash.com/photo-1544636331-e26879cd4d9b?w=800&q=80", title: "Nissan GT-R", subtitle: "2017 · 32,100 miles", category: "Performance", description: "Twin-turbo V6 with ATTESA E-TS AWD. Bayside Blue." },
  { id: "v5", image: "https://images.unsplash.com/photo-1580273916550-e323be2ae537?w=800&q=80", title: "Lexus LC 500", subtitle: "2021 · 11,500 miles", category: "Grand Tourer", description: "5.0L V8 with 10-speed auto. Infrared with semi-aniline leather." },
];

const editorialItems: EditorialCardData[] = [
  { id: "e1", image: "https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800&q=80", title: "Porsche 911 Carrera", category: "Sports Car", year: "2019", description: "Immaculate condition with full service history. Guards Red over Black leather. This 992-generation 911 represents the pinnacle of sports car engineering.", cta: "View Details", ctaLink: "/deal/1" },
  { id: "e2", image: "https://images.unsplash.com/photo-1555215695-3004980ad54e?w=800&q=80", title: "BMW M4 Competition", category: "Performance", year: "2021", description: "S58 twin-turbo inline-6 producing 503hp. Portimao Blue with extended Merino leather.", cta: "View Details", ctaLink: "/deal/2" },
  { id: "e3", image: "https://images.unsplash.com/photo-1583121274602-3e2820c69888?w=800&q=80", title: "Audi RS6 Avant", category: "Wagon", year: "2020", description: "591hp twin-turbo V8 with quattro AWD. Combines supercar performance with wagon practicality.", cta: "View Details", ctaLink: "/deal/3" },
  { id: "e4", image: "https://images.unsplash.com/photo-1605559424843-9e4c228bf1c2?w=800&q=80", title: "Mercedes-AMG GT", category: "Grand Tourer", year: "2018", description: "Handcrafted biturbo V8 producing 523hp. Obsidian Black with Red Pepper interior.", cta: "View Details", ctaLink: "/deal/4" },
  { id: "e5", image: "https://images.unsplash.com/photo-1617531653332-bd46c24f2068?w=800&q=80", title: "Tesla Model S Plaid", category: "Electric", year: "2022", description: "Tri-motor AWD producing 1,020hp. 0-60 in 1.99s. Full Self-Driving capability.", cta: "View Details", ctaLink: "/deal/5" },
  { id: "e6", image: "https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=800&q=80", title: "Ford Mustang GT", category: "Muscle", year: "2020", description: "5.0L V8 with active exhaust producing 460hp. Rapid Red with Recaro seats.", cta: "View Details", ctaLink: "/deal/6" },
];

const fanCardItems: FanCardItem[] = [
  { id: "f1", image: "https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800&q=80", title: "Porsche 911", category: "Sports" },
  { id: "f2", image: "https://images.unsplash.com/photo-1555215695-3004980ad54e?w=800&q=80", title: "BMW M4", category: "Performance" },
  { id: "f3", image: "https://images.unsplash.com/photo-1583121274602-3e2820c69888?w=800&q=80", title: "Audi RS6", category: "Wagon" },
  { id: "f4", image: "https://images.unsplash.com/photo-1605559424843-9e4c228bf1c2?w=800&q=80", title: "AMG GT", category: "GT" },
  { id: "f5", image: "https://images.unsplash.com/photo-1617531653332-bd46c24f2068?w=800&q=80", title: "Tesla Plaid", category: "Electric" },
];

const focusSliceItems: FocusSliceItem[] = [
  { id: "fs1", image: "https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800&q=80", title: "Porsche 911 Carrera", subtitle: "2019 · 12,400 miles", category: "Sports Car", description: "Immaculate condition with full service history." },
  { id: "fs2", image: "https://images.unsplash.com/photo-1555215695-3004980ad54e?w=800&q=80", title: "BMW M4 Competition", subtitle: "2021 · 8,200 miles", category: "Performance", description: "S58 twin-turbo inline-6. Portimao Blue." },
  { id: "fs3", image: "https://images.unsplash.com/photo-1583121274602-3e2820c69888?w=800&q=80", title: "Audi RS6 Avant", subtitle: "2020 · 15,800 miles", category: "Wagon", description: "591hp twin-turbo V8 with quattro AWD." },
  { id: "fs4", image: "https://images.unsplash.com/photo-1605559424843-9e4c228bf1c2?w=800&q=80", title: "Mercedes-AMG GT", subtitle: "2018 · 22,100 miles", category: "Grand Tourer", description: "Handcrafted biturbo V8. Obsidian Black." },
  { id: "fs5", image: "https://images.unsplash.com/photo-1617531653332-bd46c24f2068?w=800&q=80", title: "Tesla Model S Plaid", subtitle: "2022 · 5,400 miles", category: "Electric", description: "Tri-motor AWD. 0-60 in 1.99s." },
];

const cinemaItems: CinemaItem[] = [
  { id: "c1", image: "https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800&q=80", title: "Porsche 911 Carrera", subtitle: "2019 · 12,400 miles", category: "Sports Car", description: "Immaculate condition with full service history.", year: "2019" },
  { id: "c2", image: "https://images.unsplash.com/photo-1555215695-3004980ad54e?w=800&q=80", title: "BMW M4 Competition", subtitle: "2021 · 8,200 miles", category: "Performance", description: "S58 twin-turbo inline-6. Portimao Blue.", year: "2021" },
  { id: "c3", image: "https://images.unsplash.com/photo-1583121274602-3e2820c69888?w=800&q=80", title: "Audi RS6 Avant", subtitle: "2020 · 15,800 miles", category: "Wagon", description: "591hp twin-turbo V8 with quattro AWD.", year: "2020" },
  { id: "c4", image: "https://images.unsplash.com/photo-1605559424843-9e4c228bf1c2?w=800&q=80", title: "Mercedes-AMG GT", subtitle: "2018 · 22,100 miles", category: "Grand Tourer", description: "Handcrafted biturbo V8. Obsidian Black.", year: "2018" },
  { id: "c5", image: "https://images.unsplash.com/photo-1617531653332-bd46c24f2068?w=800&q=80", title: "Tesla Model S Plaid", subtitle: "2022 · 5,400 miles", category: "Electric", description: "Tri-motor AWD. 0-60 in 1.99s.", year: "2022" },
];

const polaroidItems: PolaroidFlipItem[] = [
  { id: "p1", image: "https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800&q=80", backImage: "https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=400&q=60", title: "Porsche 911", subtitle: "2019", category: "Sports Car", description: "Immaculate condition with full service history. Guards Red over Black leather." },
  { id: "p2", image: "https://images.unsplash.com/photo-1555215695-3004980ad54e?w=800&q=80", backImage: "https://images.unsplash.com/photo-1555215695-3004980ad54e?w=400&q=60", title: "BMW M4", subtitle: "2021", category: "Performance", description: "S58 twin-turbo inline-6 producing 503hp. Portimao Blue." },
  { id: "p3", image: "https://images.unsplash.com/photo-1583121274602-3e2820c69888?w=800&q=80", backImage: "https://images.unsplash.com/photo-1583121274602-3e2820c69888?w=400&q=60", title: "Audi RS6", subtitle: "2020", category: "Wagon", description: "591hp twin-turbo V8 with quattro AWD." },
  { id: "p4", image: "https://images.unsplash.com/photo-1605559424843-9e4c228bf1c2?w=800&q=80", backImage: "https://images.unsplash.com/photo-1605559424843-9e4c228bf1c2?w=400&q=60", title: "AMG GT", subtitle: "2018", category: "Grand Tourer", description: "Handcrafted biturbo V8. Obsidian Black." },
  { id: "p5", image: "https://images.unsplash.com/photo-1617531653332-bd46c24f2068?w=800&q=80", backImage: "https://images.unsplash.com/photo-1617531653332-bd46c24f2068?w=400&q=60", title: "Tesla Plaid", subtitle: "2022", category: "Electric", description: "Tri-motor AWD. 0-60 in 1.99s." },
];

const premiumItems: PremiumCarouselItem[] = [
  { id: "pr1", image: "https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800&q=80", title: "Porsche 911 Carrera", subtitle: "2019 · 12,400 miles", category: "Sports Car", description: "Immaculate condition with full service history.", price: "$89,900", year: "2019", mileage: "12,400 mi", cta: "View Deal" },
  { id: "pr2", image: "https://images.unsplash.com/photo-1555215695-3004980ad54e?w=800&q=80", title: "BMW M4 Competition", subtitle: "2021 · 8,200 miles", category: "Performance", description: "S58 twin-turbo inline-6. Portimao Blue.", price: "$72,500", year: "2021", mileage: "8,200 mi", cta: "View Deal" },
  { id: "pr3", image: "https://images.unsplash.com/photo-1583121274602-3e2820c69888?w=800&q=80", title: "Audi RS6 Avant", subtitle: "2020 · 15,800 miles", category: "Wagon", description: "591hp twin-turbo V8 with quattro AWD.", price: "$78,900", year: "2020", mileage: "15,800 mi", cta: "View Deal" },
  { id: "pr4", image: "https://images.unsplash.com/photo-1605559424843-9e4c228bf1c2?w=800&q=80", title: "Mercedes-AMG GT", subtitle: "2018 · 22,100 miles", category: "Grand Tourer", description: "Handcrafted biturbo V8. Obsidian Black.", price: "$95,000", year: "2018", mileage: "22,100 mi", cta: "View Deal" },
  { id: "pr5", image: "https://images.unsplash.com/photo-1617531653332-bd46c24f2068?w=800&q=80", title: "Tesla Model S Plaid", subtitle: "2022 · 5,400 miles", category: "Electric", description: "Tri-motor AWD. 0-60 in 1.99s.", price: "$115,000", year: "2022", mileage: "5,400 mi", cta: "View Deal" },
];

const hoverRevealItems: ImageHoverRevealItem[] = [
  { id: "h1", image: "https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800&q=80", hoverImage: "https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800&q=80&sat=-100", title: "Porsche 911", category: "Sports" },
  { id: "h2", image: "https://images.unsplash.com/photo-1555215695-3004980ad54e?w=800&q=80", hoverImage: "https://images.unsplash.com/photo-1555215695-3004980ad54e?w=800&q=80&sat=-100", title: "BMW M4", category: "Performance" },
  { id: "h3", image: "https://images.unsplash.com/photo-1583121274602-3e2820c69888?w=800&q=80", hoverImage: "https://images.unsplash.com/photo-1583121274602-3e2820c69888?w=800&q=80&sat=-100", title: "Audi RS6", category: "Wagon" },
  { id: "h4", image: "https://images.unsplash.com/photo-1605559424843-9e4c228bf1c2?w=800&q=80", hoverImage: "https://images.unsplash.com/photo-1605559424843-9e4c228bf1c2?w=800&q=80&sat=-100", title: "AMG GT", category: "GT" },
  { id: "h5", image: "https://images.unsplash.com/photo-1617531653332-bd46c24f2068?w=800&q=80", hoverImage: "https://images.unsplash.com/photo-1617531653332-bd46c24f2068?w=800&q=80&sat=-100", title: "Tesla Plaid", category: "Electric" },
];

const stackDriftItems: StackDriftItem[] = [
  { id: "sd1", image: "https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800&q=80", title: "Porsche 911 Carrera", subtitle: "2019 · 12,400 miles", category: "Sports Car", description: "Immaculate condition with full service history." },
  { id: "sd2", image: "https://images.unsplash.com/photo-1555215695-3004980ad54e?w=800&q=80", title: "BMW M4 Competition", subtitle: "2021 · 8,200 miles", category: "Performance", description: "S58 twin-turbo inline-6. Portimao Blue." },
  { id: "sd3", image: "https://images.unsplash.com/photo-1583121274602-3e2820c69888?w=800&q=80", title: "Audi RS6 Avant", subtitle: "2020 · 15,800 miles", category: "Wagon", description: "591hp twin-turbo V8 with quattro AWD." },
  { id: "sd4", image: "https://images.unsplash.com/photo-1605559424843-9e4c228bf1c2?w=800&q=80", title: "Mercedes-AMG GT", subtitle: "2018 · 22,100 miles", category: "Grand Tourer", description: "Handcrafted biturbo V8. Obsidian Black." },
  { id: "sd5", image: "https://images.unsplash.com/photo-1617531653332-bd46c24f2068?w=800&q=80", title: "Tesla Model S Plaid", subtitle: "2022 · 5,400 miles", category: "Electric", description: "Tri-motor AWD. 0-60 in 1.99s." },
];

const videoDeckItems: VideoDeckItem[] = [
  { id: "vd1", video: "https://www.w3schools.com/html/mov_bbb.mp4", poster: "https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800&q=80", title: "Porsche 911 Walkaround", subtitle: "Full exterior and interior tour", category: "Video", description: "Complete walkaround of this immaculate 911 Carrera.", duration: "3:24" },
  { id: "vd2", video: "https://www.w3schools.com/html/mov_bbb.mp4", poster: "https://images.unsplash.com/photo-1555215695-3004980ad54e?w=800&q=80", title: "BMW M4 Test Drive", subtitle: "On-track performance review", category: "Video", description: "Experience the M4 Competition on the track.", duration: "5:12" },
  { id: "vd3", video: "https://www.w3schools.com/html/mov_bbb.mp4", poster: "https://images.unsplash.com/photo-1583121274602-3e2820c69888?w=800&q=80", title: "Audi RS6 Review", subtitle: "Daily driver meets supercar", category: "Video", description: "The ultimate wagon for every occasion.", duration: "4:45" },
];

const drawerCardItems: DrawerCardItem[] = [
  { id: "dc1", image: "https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800&q=80", title: "Porsche 911 Carrera", subtitle: "2019 · 12,400 miles", category: "Sports Car", description: "Immaculate condition with full service history. Guards Red over Black leather.", specs: [{ label: "Engine", value: "3.0L Twin-Turbo Flat-6" }, { label: "Power", value: "443 hp" }, { label: "Transmission", value: "8-speed PDK" }, { label: "0-60 mph", value: "3.2 sec" }, { label: "Top Speed", value: "191 mph" }] },
  { id: "dc2", image: "https://images.unsplash.com/photo-1555215695-3004980ad54e?w=800&q=80", title: "BMW M4 Competition", subtitle: "2021 · 8,200 miles", category: "Performance", description: "S58 twin-turbo inline-6. Portimao Blue with extended Merino leather.", specs: [{ label: "Engine", value: "3.0L Twin-Turbo Inline-6" }, { label: "Power", value: "503 hp" }, { label: "Transmission", value: "8-speed Auto" }, { label: "0-60 mph", value: "3.8 sec" }, { label: "Top Speed", value: "180 mph" }] },
  { id: "dc3", image: "https://images.unsplash.com/photo-1583121274602-3e2820c69888?w=800&q=80", title: "Audi RS6 Avant", subtitle: "2020 · 15,800 miles", category: "Wagon", description: "591hp twin-turbo V8 with quattro AWD.", specs: [{ label: "Engine", value: "4.0L Twin-Turbo V8" }, { label: "Power", value: "591 hp" }, { label: "Transmission", value: "8-speed Auto" }, { label: "0-60 mph", value: "3.5 sec" }, { label: "Top Speed", value: "190 mph" }] },
  { id: "dc4", image: "https://images.unsplash.com/photo-1605559424843-9e4c228bf1c2?w=800&q=80", title: "Mercedes-AMG GT", subtitle: "2018 · 22,100 miles", category: "Grand Tourer", description: "Handcrafted biturbo V8. Obsidian Black with Red Pepper interior.", specs: [{ label: "Engine", value: "4.0L Twin-Turbo V8" }, { label: "Power", value: "523 hp" }, { label: "Transmission", value: "7-speed DCT" }, { label: "0-60 mph", value: "3.7 sec" }, { label: "Top Speed", value: "193 mph" }] },
  { id: "dc5", image: "https://images.unsplash.com/photo-1617531653332-bd46c24f2068?w=800&q=80", title: "Tesla Model S Plaid", subtitle: "2022 · 5,400 miles", category: "Electric", description: "Tri-motor AWD. 0-60 in 1.99s. Full Self-Driving capability.", specs: [{ label: "Motors", value: "Tri-Motor AWD" }, { label: "Power", value: "1,020 hp" }, { label: "Range", value: "396 miles" }, { label: "0-60 mph", value: "1.99 sec" }, { label: "Top Speed", value: "200 mph" }] },
];

// ── Section Wrapper ──
function ShowcaseSection({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="py-12 md:py-16">
      <div className="max-w-7xl mx-auto px-4 md:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="mb-8"
        >
          <h2 className="text-2xl md:text-3xl font-bold text-[var(--t1)] mb-2">{title}</h2>
          {subtitle && <p className="text-[var(--t4)] text-sm md:text-base">{subtitle}</p>}
        </motion.div>
        {children}
      </div>
    </section>
  );
}

// ── Main Page ──
export default function ShowcasePage() {
  const [activeTab, setActiveTab] = useState<string>("all");

  const tabs = [
    { id: "all", label: "All" },
    { id: "dna", label: "DNA" },
    { id: "vertical", label: "Vertical" },
    { id: "editorial", label: "Editorial" },
    { id: "fan", label: "Fan" },
    { id: "focus", label: "Focus" },
    { id: "cinema", label: "Cinema" },
    { id: "polaroid", label: "Polaroid" },
    { id: "premium", label: "Premium" },
    { id: "hover", label: "Hover" },
    { id: "media", label: "Media" },
    { id: "stack", label: "Stack" },
    { id: "video", label: "Video" },
    { id: "drawer", label: "Drawer" },
  ];

  return (
    <div className="min-h-screen bg-[var(--s1)]">
      {/* Hero */}
      <div className="relative py-16 md:py-24 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[var(--amber-lo)] via-transparent to-[var(--plo)] opacity-30" />
        <div className="relative max-w-7xl mx-auto px-4 md:px-6 text-center">
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}>
            <span className="inline-block px-4 py-1.5 mb-6 text-xs font-bold uppercase tracking-widest text-[var(--amber)] bg-[var(--amber-lo)] rounded-full">
              UI Showcase
            </span>
            <h1 className="text-4xl md:text-6xl font-black text-[var(--t1)] mb-4 leading-tight">
              14 Advanced
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[var(--amber)] to-[var(--purple)]">
                Carousel Components
              </span>
            </h1>
            <p className="text-lg text-[var(--t4)] max-w-2xl mx-auto">
              Cinematic 3D carousels, vertical scroll experiences, editorial cards, video decks, and more.
            </p>
          </motion.div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="sticky top-0 z-40 bg-[var(--s1)]/80 backdrop-blur-xl border-b border-[var(--b1)]">
        <div className="max-w-7xl mx-auto px-4 md:px-6">
          <div className="flex gap-1 overflow-x-auto py-3 scrollbar-hide">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 text-sm font-semibold rounded-full whitespace-nowrap transition-all ${
                  activeTab === tab.id
                    ? "bg-[var(--grad)] text-white"
                    : "text-[var(--t4)] hover:text-[var(--t1)] hover:bg-[var(--s2)]"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.3 }}
        >
          {/* DNA Carousel */}
          {(activeTab === "all" || activeTab === "dna") && (
            <ShowcaseSection title="DNA Carousel" subtitle="3D helix with depth, rotation, RGB split, infinite loop.">
              <div className="glass-panel p-6 md:p-10">
                <DNACarousel items={showcaseItems} autoPlay={true} autoPlaySpeed={4000} depth={300} curve={1} helixSpread={1} perspective={1200} imageWidth={280} imageHeight={380} imageRadius={20} blur={6} rgbSplit={2} inactiveOpacity={0.35} shadow={true} shadowStrength={0.25} />
              </div>
            </ShowcaseSection>
          )}

          {/* Vertical Carousel */}
          {(activeTab === "all" || activeTab === "vertical") && (
            <ShowcaseSection title="Vertical Carousel 3D" subtitle="Infinite vertical scroll with momentum and background blur.">
              <div className="glass-panel p-6 md:p-10">
                <VerticalCarousel3D items={verticalItems} autoPlay={true} autoPlaySpeed={3500} cardWidth={300} cardHeight={400} verticalSpacing={24} backgroundBlur={25} overlayOpacity={0.7} damping={18} />
              </div>
            </ShowcaseSection>
          )}

          {/* Editorial Cards */}
          {(activeTab === "all" || activeTab === "editorial") && (
            <ShowcaseSection title="Editorial Grid" subtitle="Modern editorial-style cards with hover animations.">
              <EditorialGrid items={editorialItems} columns={3} />
            </ShowcaseSection>
          )}

          {/* Fan Card Carousel */}
          {(activeTab === "all" || activeTab === "fan") && (
            <ShowcaseSection title="Fan Card Carousel" subtitle="Cards fan out in a 3D arc with smooth rotation.">
              <div className="glass-panel p-6 md:p-10">
                <FanCardCarousel items={fanCardItems} autoPlay={true} autoPlaySpeed={3000} maxRotation={60} radius={300} />
              </div>
            </ShowcaseSection>
          )}

          {/* Focus Slice Carousel */}
          {(activeTab === "all" || activeTab === "focus") && (
            <ShowcaseSection title="Focus Slice Carousel" subtitle="Full-width display with slice indicators and thumbnail strip.">
              <div className="glass-panel p-6 md:p-10">
                <FocusSliceCarousel items={focusSliceItems} autoPlay={true} autoPlaySpeed={4000} />
              </div>
            </ShowcaseSection>
          )}

          {/* Cinema Carousel */}
          {(activeTab === "all" || activeTab === "cinema") && (
            <ShowcaseSection title="Cinema Carousel" subtitle="Cinematic widescreen display with film strip navigation.">
              <div className="glass-panel p-6 md:p-10">
                <CinemaCarousel items={cinemaItems} autoPlay={true} autoPlaySpeed={5000} />
              </div>
            </ShowcaseSection>
          )}

          {/* Polaroid Flip Cards */}
          {(activeTab === "all" || activeTab === "polaroid") && (
            <ShowcaseSection title="Polaroid Flip Cards" subtitle="Vintage polaroid-style cards with flip interaction.">
              <div className="glass-panel p-6 md:p-10">
                <PolaroidGrid items={polaroidItems} />
              </div>
            </ShowcaseSection>
          )}

          {/* Premium Carousel */}
          {(activeTab === "all" || activeTab === "premium") && (
            <ShowcaseSection title="Premium Carousel" subtitle="Feature-rich with pricing, specs, CTAs, thumbnails.">
              <div className="glass-panel p-6 md:p-10">
                <PremiumCarousel items={premiumItems} autoPlay={true} autoPlaySpeed={4000} />
              </div>
            </ShowcaseSection>
          )}

          {/* Image Hover Reveal */}
          {(activeTab === "all" || activeTab === "hover") && (
            <ShowcaseSection title="Image Hover Reveal" subtitle="Smooth image transition on hover with visual effects.">
              <div className="glass-panel p-6 md:p-10">
                <ImageHoverRevealGrid items={hoverRevealItems} columns={3} />
              </div>
            </ShowcaseSection>
          )}

          {/* Vertical Media Flow */}
          {(activeTab === "all" || activeTab === "media") && (
            <ShowcaseSection title="Vertical Media Flow" subtitle="Scroll-driven media showcase with sticky display.">
              <div className="glass-panel p-6 md:p-10">
                <VerticalMediaFlow items={verticalItems} />
              </div>
            </ShowcaseSection>
          )}

          {/* Stack Drift Carousel */}
          {(activeTab === "all" || activeTab === "stack") && (
            <ShowcaseSection title="Stack Drift Carousel" subtitle="Stacked cards with drift animation and preview.">
              <div className="glass-panel p-6 md:p-10">
                <StackDriftCarousel items={stackDriftItems} autoPlay={true} autoPlaySpeed={3000} />
              </div>
            </ShowcaseSection>
          )}

          {/* Video Deck Carousel */}
          {(activeTab === "all" || activeTab === "video") && (
            <ShowcaseSection title="Video Deck Carousel" subtitle="Video showcase with autoplay and thumbnail navigation.">
              <div className="glass-panel p-6 md:p-10">
                <VideoDeckCarousel items={videoDeckItems} autoPlay={true} autoPlaySpeed={6000} />
              </div>
            </ShowcaseSection>
          )}

          {/* Drawer Card Grid */}
          {(activeTab === "all" || activeTab === "drawer") && (
            <ShowcaseSection title="Drawer Card Grid" subtitle="Click any card to open a detailed drawer panel.">
              <div className="glass-panel p-6 md:p-10">
                <DrawerCardGrid items={drawerCardItems} columns={3} />
              </div>
            </ShowcaseSection>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Footer */}
      <footer className="py-12 border-t border-[var(--b1)]">
        <div className="max-w-7xl mx-auto px-4 md:px-6 text-center">
          <p className="text-sm text-[var(--t4)]">Built with Next.js, Framer Motion, and Tailwind CSS</p>
          <p className="text-xs text-[var(--t5)] mt-2">14 Advanced Carousel & Card Components</p>
        </div>
      </footer>
    </div>
  );
}
