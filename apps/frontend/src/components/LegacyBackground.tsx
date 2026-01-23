type Props = {
  variant?: "login" | "app" | "totem";
};

export default function LegacyBackground({ variant = "app" }: Props) {
  if (variant === "totem") {
    return (
      <div
        className="fixed inset-0 -z-10 bg-cover bg-center"
        style={{
          background:
            "url('/assets/images/BG Vertical.jpg') no-repeat center center fixed, linear-gradient(135deg, #1d4ed8 0%, #ffffff 100%)",
          backgroundSize: "cover"
        }}
      />
    );
  }

  return (
    <>
      <div className="bg-animated opacity-10 fixed top-0 left-0 w-full h-full -z-10" />
      <div className="fixed w-full h-full overflow-hidden -z-10">
        {/* mesmos 4 shapes do legado */}
        <div className="floating-shape absolute bg-white/10 rounded-full w-20 h-20 left-[10%]" style={{ animationDelay: "0s" }} />
        <div className="floating-shape absolute bg-white/10 rounded-full w-[120px] h-[120px] left-[20%]" style={{ animationDelay: "2s" }} />
        <div className="floating-shape absolute bg-white/10 rounded-full w-[60px] h-[60px] left-[70%]" style={{ animationDelay: "4s" }} />
        <div className="floating-shape absolute bg-white/10 rounded-full w-[100px] h-[100px] left-[80%]" style={{ animationDelay: "6s" }} />
      </div>
    </>
  );
}

