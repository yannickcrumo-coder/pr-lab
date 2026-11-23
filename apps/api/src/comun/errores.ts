/**
 * Errores con formato RFC 9457 (problem details).
 *
 * El cliente decide qué texto mostrar a partir de `code`, nunca de `detail`,
 * que es para quien depura. Por eso `code` es parte del contrato y no se
 * cambia a la ligera.
 */
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

export interface CuerpoProblema {
  type: string;
  title: string;
  status: number;
  code: string;
  detail?: string;
  errors?: { field: string; code: string }[];
}

export class ErrorApi extends HttpException {
  constructor(
    status: number,
    readonly code: string,
    title: string,
    detail?: string,
    errors?: { field: string; code: string }[],
  ) {
    const cuerpo: CuerpoProblema = {
      type: `https://api.prlab.app/errores/${code}`,
      title,
      status,
      code,
    };
    if (detail) cuerpo.detail = detail;
    if (errors) cuerpo.errors = errors;
    super(cuerpo, status);
  }
}

export const Errores = {
  noAutorizado: (code = 'credenciales_invalidas', detail?: string) =>
    new ErrorApi(HttpStatus.UNAUTHORIZED, code, 'No autorizado', detail),

  /** Sin relación activa que dé acceso. Es el error del modelo de permisos. */
  prohibido: (code = 'sin_relacion_activa', detail?: string) =>
    new ErrorApi(HttpStatus.FORBIDDEN, code, 'Acceso denegado', detail),

  noEncontrado: (code = 'no_encontrado', detail?: string) =>
    new ErrorApi(HttpStatus.NOT_FOUND, code, 'No encontrado', detail),

  conflicto: (code: string, detail?: string) =>
    new ErrorApi(HttpStatus.CONFLICT, code, 'Conflicto', detail),

  noProcesable: (errors: { field: string; code: string }[], detail?: string) =>
    new ErrorApi(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'datos_invalidos',
      'Datos inválidos',
      detail,
      errors,
    ),

  demasiadosIntentos: (detail?: string) =>
    new ErrorApi(HttpStatus.TOO_MANY_REQUESTS, 'demasiados_intentos', 'Demasiados intentos', detail),
};

/**
 * Convierte cualquier excepción al formato RFC 9457.
 * Un error no previsto nunca filtra su mensaje al cliente: se registra y se
 * devuelve genérico, porque un mensaje de la base puede revelar el esquema.
 */
@Catch()
export class FiltroDeErrores implements ExceptionFilter {
  private readonly log = new Logger('Errores');

  catch(error: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    let cuerpo: CuerpoProblema;

    if (error instanceof HttpException) {
      const respuesta = error.getResponse();
      const status = error.getStatus();
      cuerpo =
        typeof respuesta === 'object' && respuesta !== null && 'code' in respuesta
          ? (respuesta as CuerpoProblema)
          : {
              type: 'https://api.prlab.app/errores/http',
              title: error.message,
              status,
              code: nombreGenerico(status),
            };
    } else {
      this.log.error(
        `${req.method} ${req.url}`,
        error instanceof Error ? error.stack : String(error),
      );
      cuerpo = {
        type: 'https://api.prlab.app/errores/interno',
        title: 'Error interno',
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        code: 'error_interno',
      };
    }

    res.status(cuerpo.status).type('application/problem+json').send(cuerpo);
  }
}

function nombreGenerico(status: number): string {
  if (status === 401) return 'no_autorizado';
  if (status === 403) return 'prohibido';
  if (status === 404) return 'no_encontrado';
  if (status === 409) return 'conflicto';
  if (status === 422) return 'datos_invalidos';
  if (status === 429) return 'demasiados_intentos';
  return 'error';
}
