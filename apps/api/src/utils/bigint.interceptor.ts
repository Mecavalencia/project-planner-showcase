import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { map, Observable } from "rxjs";

@Injectable()
export class BigIntInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map((value) => serializeBigInt(value)));
  }
}

function serializeBigInt(value: unknown): unknown {
  return JSON.parse(
    JSON.stringify(value, (_key, nestedValue) => (typeof nestedValue === "bigint" ? nestedValue.toString() : nestedValue))
  );
}
