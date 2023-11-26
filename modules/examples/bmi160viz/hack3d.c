#include "xsmc.h"
#include "mc.xs.h"			// for xsID_ values
#include "xsHost.h"

void xs_Matrix(xsMachine *the)
{
	if ((1 == xsmcArgc) && xsmcTest(xsArg(0)))		// instanceof Float64Array and length === 16
		xsmcSet(xsThis, xsID_m, xsArg(0));
	else if (16 == xsmcArgc) {		// typeof first argument is number
		xsNumberValue d[16], *r;
		xsUnsignedValue rSize;
		xsmcVars(1);
		xsmcSetInteger(xsVar(0), 16);
		xsmcNew(xsVar(0), xsGlobal, xsID_Float64Array, &xsVar(0), NULL);
		xsmcSet(xsThis, xsID_m, xsVar(0));
		for (int i = 0; i < 16; i++)
			d[i] = xsmcToNumber(xsArg(i));
		
		xsmcGet(xsVar(0), xsVar(0), xsID_buffer);
		xsmcGetBufferWritable(xsVar(0), (void **)&r, &rSize);
		if (128 != rSize)
			xsUnknownError("unexpected");
		c_memmove(r, d, rSize);
	}
	else
		xsUnknownError("Invalid arguments");
}

void xs_matrix_multiply(xsMachine *the)
{
  xsNumberValue *m, *r, *result;
  xsUnsignedValue mSize, rSize, resultSize;
  xsSlot n;

  xsmcVars(3);
  xsmcSetInteger(n, 16);
  xsmcNew(xsVar(0), xsGlobal, xsID_Float64Array, &n, NULL);
  xsmcNew(xsResult, xsThis, xsID_constructor, &xsVar(0), NULL);

  xsmcGet(xsVar(0), xsThis, xsID_m);
  xsmcGet(xsVar(0), xsVar(0), xsID_buffer);

  xsmcGet(xsVar(1), xsArg(0), xsID_m);
  xsmcGet(xsVar(1), xsVar(1), xsID_buffer);

  xsmcGet(xsVar(2), xsResult, xsID_m);
  xsmcGet(xsVar(2), xsVar(2), xsID_buffer);

  xsmcGetBufferReadable(xsVar(0), (void **)&m, &mSize);
  xsmcGetBufferReadable(xsVar(1), (void **)&r, &rSize);
  xsmcGetBufferWritable(xsVar(2), (void **)&result, &resultSize);
  if ((mSize != 128) || (rSize != 128) || (resultSize != 128))
    xsUnknownError("invalid input");

  result[0] = m[0] * r[0] + m[1] * r[4] + m[2] * r[8] + m[3] * r[12];
  result[1] = m[0] * r[1] + m[1] * r[5] + m[2] * r[9] + m[3] * r[13];
  result[2] = m[0] * r[2] + m[1] * r[6] + m[2] * r[10] + m[3] * r[14];
  result[3] = m[0] * r[3] + m[1] * r[7] + m[2] * r[11] + m[3] * r[15];
  result[4] = m[4] * r[0] + m[5] * r[4] + m[6] * r[8] + m[7] * r[12];
  result[5] = m[4] * r[1] + m[5] * r[5] + m[6] * r[9] + m[7] * r[13];
  result[6] = m[4] * r[2] + m[5] * r[6] + m[6] * r[10] + m[7] * r[14];
  result[7] = m[4] * r[3] + m[5] * r[7] + m[6] * r[11] + m[7] * r[15];
  result[8] = m[8] * r[0] + m[9] * r[4] + m[10] * r[8] + m[11] * r[12];
  result[9] = m[8] * r[1] + m[9] * r[5] + m[10] * r[9] + m[11] * r[13];
  result[10] = m[8] * r[2] + m[9] * r[6] + m[10] * r[10] + m[11] * r[14];
  result[11] = m[8] * r[3] + m[9] * r[7] + m[10] * r[11] + m[11] * r[15];
  result[12] = m[12] * r[0] + m[13] * r[4] + m[14] * r[8] + m[15] * r[12];
  result[13] = m[12] * r[1] + m[13] * r[5] + m[14] * r[9] + m[15] * r[13];
  result[14] = m[12] * r[2] + m[13] * r[6] + m[14] * r[10] + m[15] * r[14];
  result[15] = m[12] * r[3] + m[13] * r[7] + m[14] * r[11] + m[15] * r[15];
}

void xs_matrix_multiplyVec4(xsMachine *the)
{
  xsNumberValue wIn, xIn, yIn, zIn;
  xsNumberValue wOut, xOut, yOut, zOut;
  xsNumberValue *m;
  xsUnsignedValue mSize;
  xsSlot n;

  xsmcVars(1);

  xsmcGet(n, xsArg(0), xsID_w); wIn = xsmcToNumber(n);
  xsmcGet(n, xsArg(0), xsID_x); xIn = xsmcToNumber(n);
  xsmcGet(n, xsArg(0), xsID_y); yIn = xsmcToNumber(n);
  xsmcGet(n, xsArg(0), xsID_z); zIn = xsmcToNumber(n);

  xsmcGet(xsVar(0), xsThis, xsID_m);
  xsmcGet(xsVar(0), xsVar(0), xsID_buffer);
  xsmcGetBufferReadable(xsVar(0), (void **)&m, &mSize);
  if (128 != mSize)
    xsUnknownError("invalid");

  xOut = m[0] * xIn + m[1] * yIn + m[2] * zIn + m[3] * wIn;
  yOut = m[4] * xIn + m[5] * yIn + m[6] * zIn + m[7] * wIn;
  zOut = m[8] * xIn + m[9] * yIn + m[10] * zIn + m[11] * wIn;
  wOut = m[12] * xIn + m[13] * yIn + m[14] * zIn + m[15] * wIn;

  xsmcSetNewObject(xsResult);
  xsmcSetNumber(n, xOut); xsmcSet(xsResult, xsID_x, n);
  xsmcSetNumber(n, yOut); xsmcSet(xsResult, xsID_y, n);
  xsmcSetNumber(n, zOut); xsmcSet(xsResult, xsID_z, n);
  xsmcSetNumber(n, wOut); xsmcSet(xsResult, xsID_w, n);
}
