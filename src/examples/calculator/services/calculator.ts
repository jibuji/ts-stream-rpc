import { ICalculator, CalculatorWrapper } from '../generated/calculator-service';

export class CalculatorService implements ICalculator {
  async add(request: {a: number, b: number}): Promise<{result: number}> {
    return { result: request.a + request.b };
  }

  async multiply(request: {a: number, b: number}): Promise<{result: number}> {
    return { result: request.a * request.b };
  }
}