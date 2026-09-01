import { NextResponse, type NextRequest } from 'next/server';
import {
  RequestBoundaryError,
  assertTrustedRequest,
} from '@/lib/request-boundary';

export function proxy(request: NextRequest) {
  try {
    assertTrustedRequest(request);
  } catch (error) {
    if (error instanceof RequestBoundaryError)
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    throw error;
  }
  return NextResponse.next();
}

export const config = {
  matcher: '/api/:path*',
};
