#ifndef _MATH_H
#define _MATH_H

#define M_PI   3.14159265358979323846
#define M_E    2.71828182845904523536
#define HUGE_VAL (__builtin_huge_val())
#define NAN (__builtin_nanf(""))
#define INFINITY (__builtin_inff())
#define isnan(x) __builtin_isnan(x)
#define isfinite(x) __builtin_isfinite(x)
#define copysign(x, y) __builtin_copysign(x, y)

#define sin(x) __builtin_sin(x)
#define cos(x) __builtin_cos(x)
#define sqrt(x) __builtin_sqrt(x)
double exp(double x);
double log(double x);
double pow(double x, double y);
double fabs(double x);
double floor(double x);
double ceil(double x);
double ldexp(double x, int exp);
double frexp(double x, int *exp);

#endif
