import { NextRequest, NextResponse } from "next/server";
import { authenticateUser, SESSION_COOKIE_NAME } from "@/lib/auth/local-auth";

function isSecureRequest(req: NextRequest): boolean {
  const forwardedProto = req.headers.get("x-forwarded-proto");
  if (forwardedProto) {
    return forwardedProto.split(",")[0].trim() === "https";
  }
  return req.nextUrl.protocol === "https:";
}

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    const user = await authenticateUser(email, password);

    if (!user) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }

    const response = NextResponse.json({
      success: true,
      user: { id: user.id, email: user.email },
    });

    // Set session cookie (HttpOnly for security)
    response.cookies.set(SESSION_COOKIE_NAME, user.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production" && isSecureRequest(req),
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60, // 30 days
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("[Auth] Login error:", error);
    return NextResponse.json(
      { error: "Authentication failed" },
      { status: 500 }
    );
  }
}
